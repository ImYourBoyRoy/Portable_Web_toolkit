// ./Web_Toolkit/shared/lib/dev-server.mjs
/**
 * Ports and server ownership for every toolkit command that starts a server (previews, probes, audits).
 *
 * Rules this module enforces:
 *  1. Never assume a port is free (4321 is Astro's default and is often the user's own dev server): ask `findFreePort`.
 *     "Free" means nothing can bind it AND nothing answers on it, on IPv4 and IPv6 loopback (macOS and Windows let a
 *     second process bind 127.0.0.1:P while another listens on 0.0.0.0:P, so a bind test alone is not enough).
 *  2. A server the toolkit starts is registered (pid, port, start-time token, label) in `.runtime/owned-processes.json`.
 *  3. Only a registered, still-matching process can be stopped without asking (`stopOwned`, `cleanupOwned`). The token
 *     guards against pid reuse: a recycled pid is not ours. An entry whose token cannot be read is trusted only while the
 *     run that started it is still alive.
 *  4. A process the toolkit did not start is never touched. `releasePort` returns who owns the port so the caller can ask the
 *     user; it signals a foreign listener (that one process only, never its group or tree) only when told the exact pid
 *     the user approved. Pids 0 and 1 are never signalled: `kill(-1)` would reach every process the user owns.
 * The approval flag is a convention for the calling agent (ask in chat first); it is not a security boundary.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSpawn } from './spawn-cross.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REGISTRY = process.env.PORTABLE_TOOLKIT_OWNED_FILE
  ? path.resolve(process.env.PORTABLE_TOOLKIT_OWNED_FILE)
  : path.resolve(HERE, '../../.runtime/owned-processes.json');

const IS_WINDOWS = process.platform === 'win32';

/** Only real, signal-able pids. 0 is the caller's own group, 1 is init, and a negative number is a group: never ours to send. */
export const validPid = (pid) => Number.isInteger(pid) && pid > 1;

/* ------------------------------------------------------------------ ports */

function canBind(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => resolve(error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT'));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** True when something accepts a connection (a wildcard 0.0.0.0 / [::] listener answers on loopback too). */
function canConnect(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

/** Free on IPv4 and IPv6 loopback: bindable, and nothing answers there. */
export async function isPortFree(port, host = '127.0.0.1') {
  if (!(await canBind(port, host))) return false;
  if (host === '127.0.0.1' && !(await canBind(port, '::1'))) return false;
  if (await canConnect(port, '127.0.0.1')) return false;
  if (host === '127.0.0.1' && (await canConnect(port, '::1'))) return false;
  return true;
}

function osAssignedPort(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * The preferred port when it is free, otherwise a free one chosen by the OS. `busy` says the preferred port was taken, so a
 * report can say "4321 belongs to something else; using 53211".
 */
export async function findFreePort({ preferred, host = '127.0.0.1' } = {}) {
  if (Number.isInteger(preferred) && preferred > 0 && (await isPortFree(preferred, host))) return { port: preferred, preferred, busy: false };
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await osAssignedPort(host);
    if (await isPortFree(port, host)) return { port, preferred: preferred ?? null, busy: Number.isInteger(preferred) };
  }
  throw new Error('Could not find a free local port after 20 attempts.');
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 8000, windowsHide: true });
  return result.status === 0 ? String(result.stdout || '') : '';
}

function processDetails(pid) {
  if (IS_WINDOWS) {
    const row = run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']).trim().split('\n')[0] || '';
    const name = row.replace(/^"/, '').split('","')[0] || '';
    return { command: name, cwd: null };
  }
  const command = run('ps', ['-o', 'args=', '-p', String(pid)]).trim();
  let cwd = null;
  try {
    cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    const out = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
    const line = out.split('\n').find((entry) => entry.startsWith('n'));
    cwd = line ? line.slice(1) : null;
  }
  return { command, cwd };
}

/** Who is listening on a TCP port: { port, pid, command, cwd } or null. Best effort (ss, lsof, netstat); both IP families. */
export function listenerInfo(port) {
  let pid = null;
  if (IS_WINDOWS) {
    // `netstat -ano` lists IPv4 and IPv6 rows. The state word is localized, so a listening row is recognised by its foreign
    // address ending in ":0".
    for (const line of run('netstat', ['-ano']).split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (/^TCP/i.test(parts[0] ?? '') && parts[1]?.endsWith(`:${port}`) && parts[2]?.endsWith(':0')) pid = Number(parts[parts.length - 1]);
    }
  } else {
    const ss = run('ss', ['-ltnpH', `sport = :${port}`]);
    const match = /pid=(\d+)/.exec(ss);
    if (match) pid = Number(match[1]);
    if (!pid) {
      const lsof = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp']);
      const line = lsof.split('\n').find((entry) => entry.startsWith('p'));
      if (line) pid = Number(line.slice(1));
    }
  }
  if (!validPid(pid)) return null;
  return { port, pid, ...processDetails(pid) };
}

function parentPid(pid) {
  const value = Number(run('ps', ['-o', 'ppid=', '-p', String(pid)]).trim());
  return validPid(value) ? value : null;
}

function processGroup(pid) {
  const value = Number(run('ps', ['-o', 'pgid=', '-p', String(pid)]).trim());
  return validPid(value) ? value : null;
}

/**
 * Whether the process listening on `port` is `rootPid` or one of its descendants (same process group, or a parent chain that
 * reaches it): true, false, or null when it cannot be told (no ss/lsof/ps, or Windows).
 */
export function listenerBelongsTo(port, rootPid) {
  if (IS_WINDOWS) return null;
  const listener = listenerInfo(port);
  if (!listener) return null;
  if (listener.pid === rootPid || processGroup(listener.pid) === rootPid) return true;
  let pid = listener.pid;
  for (let depth = 0; depth < 25; depth += 1) {
    pid = parentPid(pid);
    if (pid === null) return false;
    if (pid === rootPid) return true;
  }
  return false;
}

/* --------------------------------------------------------------- registry */

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const validEntry = (entry) => entry && typeof entry === 'object' && validPid(entry.pid) && (entry.ownerPid == null || validPid(entry.ownerPid))
  && (entry.port == null || Number.isInteger(entry.port)) && (entry.token == null || typeof entry.token === 'string');

function readRegistry(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  try {
    const data = JSON.parse(text);
    return Array.isArray(data.processes) ? data.processes.filter(validEntry) : [];
  } catch {
    // An unreadable registry is set aside, never silently overwritten, so a bad file cannot erase other runs' entries unseen.
    try {
      fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      // another run already moved it
    }
    return [];
  }
}

function writeRegistry(file, processes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify({ schema: 1, processes }, null, 2)}\n`, 'utf8');
  // Windows can refuse the rename while another process (or antivirus) holds the file for a moment.
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(temp, file);
      return;
    } catch (error) {
      if (attempt >= 6 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      sleepSync(25 * (attempt + 1));
    }
  }
}

/** Serialises read-modify-write across toolkit processes with an exclusive lock file; a lock older than 10 s is stale. */
function withRegistryLock(file, fn) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  let fd = null;
  for (let attempt = 0; attempt < 100 && fd === null; attempt += 1) {
    try {
      fd = fs.openSync(lock, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 10_000) fs.unlinkSync(lock);
      } catch {
        // released meanwhile
      }
      sleepSync(20);
    }
  }
  try {
    return fn();
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
      try {
        fs.unlinkSync(lock);
      } catch {
        // already removed as stale
      }
    }
  }
}

export function isAlive(pid) {
  if (!validPid(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** True while any member of the process group led by `pid` survives (POSIX); a zombie leader reports EPERM on macOS, which is not a live member. */
function groupAlive(pid) {
  if (IS_WINDOWS || !validPid(pid)) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A value that changes when the pid is reused by another process (Linux start time, `ps` lstart, Windows StartTime). */
export function processToken(pid) {
  if (!validPid(pid)) return null;
  if (IS_WINDOWS) {
    const out = run('powershell', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).StartTime.ToFileTimeUtc()`]).trim();
    return /^\d+$/.test(out) ? out : null;
  }
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? null;
  } catch {
    return run('ps', ['-o', 'lstart=', '-p', String(pid)]).trim() || null;
  }
}

/**
 * 'live': the registered process is running and is still the one we started. 'group': its leader exited but members of its
 * process group linger. 'gone': nothing of ours remains (or it cannot be verified).
 */
function entryState(entry) {
  if (entry.token != null) {
    if (isAlive(entry.pid) && entry.token === processToken(entry.pid)) return 'live';
    return !isAlive(entry.pid) && groupAlive(entry.pid) ? 'group' : 'gone';
  }
  // No token could be read: trust the pid only while the run that started it is still alive (a recycle needs that run to have ended).
  if (!ownerAlive(entry)) return 'gone';
  return isAlive(entry.pid) ? 'live' : groupAlive(entry.pid) ? 'group' : 'gone';
}

function ownerAlive(entry) {
  if (!validPid(entry.ownerPid) || !isAlive(entry.ownerPid)) return false;
  return entry.ownerToken == null || entry.ownerToken === processToken(entry.ownerPid);
}

/** Registered processes that are still running and are still the process we started. */
export function listOwned({ registryFile = DEFAULT_REGISTRY } = {}) {
  return readRegistry(registryFile).filter((entry) => entryState(entry) !== 'gone');
}

export function isOwned(pid, { registryFile = DEFAULT_REGISTRY } = {}) {
  return listOwned({ registryFile }).some((entry) => entry.pid === pid);
}

/** The registered entry that the listening process belongs to (itself, or a member of its process group), or null. */
function ownedEntryForListener(listenerPid, registryFile) {
  const owned = listOwned({ registryFile });
  const direct = owned.find((entry) => entry.pid === listenerPid);
  if (direct) return direct;
  if (IS_WINDOWS) return null;
  const group = processGroup(listenerPid);
  return owned.find((entry) => entry.pid === group) ?? null;
}

function register(entry, registryFile) {
  withRegistryLock(registryFile, () => {
    const rest = readRegistry(registryFile).filter((existing) => existing.pid !== entry.pid && entryState(existing) !== 'gone');
    writeRegistry(registryFile, [...rest, entry]);
  });
}

function unregister(pid, registryFile) {
  withRegistryLock(registryFile, () => {
    writeRegistry(registryFile, readRegistry(registryFile).filter((entry) => entry.pid !== pid && entryState(entry) !== 'gone'));
  });
}

/* ------------------------------------------------------------- lifecycle */

/**
 * Signals one process (`group: false`, the only mode used for anyone else's process) or the process group / tree the toolkit
 * spawned (`group: true`). Refuses any pid that is not > 1.
 */
function killProcess(pid, signal, { group = false } = {}) {
  if (!validPid(pid)) return false;
  try {
    if (IS_WINDOWS) {
      spawnSync('taskkill', ['/pid', String(pid), ...(group ? ['/T'] : []), '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(group ? -pid : pid, signal);
    }
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return predicate();
}

/**
 * Stops a process the toolkit spawned as a group leader: TERM, wait, then KILL for the leader and for descendants that outlive
 * it (a wrapper such as `sh` or `pnpm` can exit while the real server is still shutting down). The token is re-checked before
 * every signal so a recycled pid is never hit.
 */
async function terminate(pid, token, graceMs) {
  const same = () => isAlive(pid) && (token == null || processToken(pid) === token);
  if (same() || (!isAlive(pid) && groupAlive(pid))) killProcess(pid, 'SIGTERM', { group: true });
  await waitFor(() => !isAlive(pid) && !groupAlive(pid), graceMs);
  if (same() || (!isAlive(pid) && groupAlive(pid))) {
    killProcess(pid, 'SIGKILL', { group: true });
    await waitFor(() => !isAlive(pid) && !groupAlive(pid), 2000);
  }
  return !isAlive(pid) && !groupAlive(pid);
}

const live = new Map();
let handlersInstalled = false;

function killLiveSync(signal = 'SIGKILL') {
  for (const [pid, token] of live) {
    if (isAlive(pid) && (token == null || processToken(pid) === token)) killProcess(pid, signal, { group: true });
    else if (groupAlive(pid)) killProcess(pid, signal, { group: true });
  }
  live.clear();
}

/** A server must not outlive a Ctrl+C (the child leads its own group, so the terminal's signal never reaches it). */
function installHandlers() {
  if (handlersInstalled) return;
  handlersInstalled = true;
  process.on('exit', () => killLiveSync());
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, () => {
      killLiveSync();
      process.kill(process.pid, signal);
    });
  }
}

/**
 * Starts a server the toolkit owns. The child leads its own process group so a stop takes down the whole tree (a package-manager
 * wrapper plus the real server); on Windows a `.cmd` shim is run through cmd.exe. It is stopped if this process exits, is
 * interrupted, or `stop()` runs.
 * @returns {{ pid: number, port: number|null, child: import('node:child_process').ChildProcess, stop: () => Promise<object> }}
 */
export function startOwned({ command, args = [], cwd = process.cwd(), env = {}, label, port = null, startedBy = 'toolkit', stdio = 'ignore', spawnOptions = {}, registryFile = DEFAULT_REGISTRY }) {
  const resolved = resolveSpawn(command, args, { cwd, env: { ...process.env, ...env }, stdio, detached: !IS_WINDOWS, windowsHide: true, ...spawnOptions });
  const child = spawn(resolved.command, resolved.args, resolved.options);
  child.on('error', () => {
    // A failed spawn (ENOENT) is reported through exit state and `pid`; without a listener it would crash the process.
  });
  if (!validPid(child.pid)) throw new Error(`Could not start ${command}`);
  const token = processToken(child.pid);
  const entry = { pid: child.pid, port, label: label ?? command, command: [command, ...args].join(' '), cwd, startedBy, ownerPid: process.pid, ownerToken: processToken(process.pid), startedAt: new Date().toISOString(), token };
  try {
    register(entry, registryFile);
  } catch (error) {
    killProcess(child.pid, 'SIGKILL', { group: true });
    throw error;
  }
  live.set(child.pid, token);
  installHandlers();
  child.once('exit', () => live.delete(child.pid));
  // stop() works from this handle (pid + start token), so a lost or corrupted registry entry cannot leave the server running.
  const stop = async () => {
    const stopped = await terminate(child.pid, token, 4000);
    live.delete(child.pid);
    try {
      unregister(child.pid, registryFile);
    } catch {
      // registry cleanup is best effort once the process is gone
    }
    return { stopped, reason: 'stopped', label: entry.label, port };
  };
  return { pid: child.pid, port, child, stop };
}

/** Stops a process the toolkit started. Refuses (and says why) for any pid that is not registered and verified. */
export async function stopOwned(pid, { registryFile = DEFAULT_REGISTRY, graceMs = 4000 } = {}) {
  if (!validPid(pid)) return { stopped: false, reason: 'invalid-pid', detail: `${pid} is not a pid the toolkit will signal.` };
  const entry = readRegistry(registryFile).find((candidate) => candidate.pid === pid);
  if (!entry) return { stopped: false, reason: 'not-owned', detail: `pid ${pid} was not started by the toolkit; it is left alone.` };
  const state = entryState(entry);
  if (state === 'gone') {
    unregister(pid, registryFile);
    const recycled = isAlive(pid);
    return recycled
      ? { stopped: false, reason: 'pid-reused', detail: `pid ${pid} now belongs to a different process (or could not be verified); it is left alone.` }
      : { stopped: true, reason: 'already-exited' };
  }
  const stopped = await terminate(pid, entry.token, graceMs);
  unregister(pid, registryFile);
  return { stopped, reason: 'stopped', label: entry.label, port: entry.port };
}

/** Stops registered servers whose starting run is gone (a crashed run left them behind); drops dead entries. */
export async function cleanupOwned({ registryFile = DEFAULT_REGISTRY, all = false } = {}) {
  const results = [];
  for (const entry of readRegistry(registryFile)) {
    if (entryState(entry) === 'gone') {
      unregister(entry.pid, registryFile);
      continue;
    }
    if (all || !ownerAlive(entry)) results.push({ pid: entry.pid, port: entry.port, label: entry.label, ...(await stopOwned(entry.pid, { registryFile })) });
  }
  return results;
}

/**
 * Frees a port. Owned listener (the registered process or a member of its group): stopped. Foreign listener: NOT touched
 * unless `approvedPid` equals that listener's pid (the user said yes to exactly that process), and then only that one process
 * is signalled; otherwise the result carries who owns it so the caller can ask.
 */
export async function releasePort(port, { approvedPid = null, registryFile = DEFAULT_REGISTRY } = {}) {
  const listener = listenerInfo(port);
  if (!listener) return { released: true, reason: 'nothing-listening', port };
  const entry = ownedEntryForListener(listener.pid, registryFile);
  if (entry) return { released: true, owned: true, port, listener, ...(await stopOwned(entry.pid, { registryFile })) };
  if (approvedPid !== listener.pid || !validPid(listener.pid)) {
    return { released: false, owned: false, reason: 'not-owned', port, listener, ask: `Port ${port} is used by pid ${listener.pid} (${listener.command || 'unknown'}${listener.cwd ? `, started in ${listener.cwd}` : ''}). The toolkit did not start it and will not stop it. Ask the user whether to stop that process, or choose another port with \`dev-ports free\`.` };
  }
  killProcess(listener.pid, 'SIGTERM', { group: false });
  const gone = await waitFor(() => !isAlive(listener.pid), 4000);
  return { released: gone, owned: false, approved: true, port, listener, ...(gone ? {} : { reason: 'still-running', detail: `pid ${listener.pid} ignored SIGTERM; it was not forced. Ask the user how to proceed.` }) };
}

/** Runs `fn` with a started, ready, owned server and always stops it afterwards. */
export async function withOwnedServer(options, fn) {
  const server = startOwned(options);
  try {
    if (options.readyUrl) {
      const ok = await waitForUrl(options.readyUrl, options.timeoutMs ?? 120_000, server.child, { port: options.port });
      if (!ok) throw new Error(`The ${options.label ?? options.command} server did not answer at ${options.readyUrl}.`);
    }
    return await fn(server);
  } finally {
    await server.stop();
  }
}

/**
 * Waits until the URL answers. With `child` it stops waiting when the child exits; with `port` (the port the child was told to use)
 * it also refuses an answer from a process that is not the child or one of its descendants, which would mean a foreign server
 * took the port between the free check and the bind.
 */
export async function waitForUrl(url, timeoutMs, child = null, { port = null } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) return false;
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
      if (response.status < 500) {
        if (child && port && listenerBelongsTo(port, child.pid) === false) {
          throw new Error(`Another process answered on port ${port} before the server the toolkit started; refusing to use it. Pick a port with \`dev-ports free\`.`);
        }
        return true;
      }
    } catch (error) {
      if (/Another process answered/.test(error?.message ?? '')) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

/** Replaces the port in `--port N`, `--port=N` and `-p N` so a configured preview command follows the chosen port. */
export function withPort(args, port, { append = false } = {}) {
  const out = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if ((arg === '--port' || arg === '-p') && index + 1 < args.length) {
      out.push(arg, String(port));
      index += 1;
    } else if (/^--port=/.test(arg)) out.push(`--port=${port}`);
    else out.push(arg);
  }
  const had = args.some((arg) => arg === '--port' || arg === '-p' || /^--port=/.test(arg));
  return had || !append ? out : [...out, '--port', String(port)];
}

export const tempRegistryFile = () => path.join(os.tmpdir(), `owned-${process.pid}-${Date.now()}.json`);
