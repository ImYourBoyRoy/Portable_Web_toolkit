import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  cleanupOwned,
  findFreePort,
  isAlive,
  isOwned,
  isPortFree,
  listOwned,
  listenerInfo,
  releasePort,
  startOwned,
  stopOwned,
  validPid,
  waitForUrl,
  withPort
} from '../Web_Toolkit/shared/lib/dev-server.mjs';

const POSIX = process.platform !== 'win32';
const registry = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-')), 'owned.json');
const SERVER = (port) => ['-e', `require('http').createServer((q,r)=>r.end('ok')).listen(${port},'127.0.0.1')`];
const started = [];
const foreigners = [];

test.after(async () => {
  for (const server of started) await server.stop();
  for (const child of foreigners) child.kill('SIGKILL');
});

function holdPort(host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, host, () => resolve(server));
  });
}

const foreign = (args) => {
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'ignore'] });
  foreigners.push(child);
  return child;
};

test('validPid refuses 0, 1, negatives and non-integers (kill(-1) would reach every process the user owns)', () => {
  for (const bad of [0, 1, -1, -500, 1.5, NaN, '123', null, undefined]) assert.equal(validPid(bad), false, String(bad));
  assert.equal(validPid(2), true);
});

test('findFreePort keeps a free preferred port and moves off a busy one, saying so', async () => {
  const holder = await holdPort();
  const busy = holder.address().port;
  try {
    assert.equal(await isPortFree(busy), false);
    const moved = await findFreePort({ preferred: busy });
    assert.notEqual(moved.port, busy);
    assert.equal(moved.busy, true);
    assert.equal(await isPortFree(moved.port), true);
  } finally {
    holder.close();
  }
  const free = (await findFreePort()).port;
  assert.deepEqual(await findFreePort({ preferred: free }), { port: free, preferred: free, busy: false });
});

test('a wildcard listener (0.0.0.0) makes a port busy, as macOS and Windows would otherwise let 127.0.0.1 bind beside it', async () => {
  const holder = await holdPort('0.0.0.0');
  try {
    assert.equal(await isPortFree(holder.address().port), false);
  } finally {
    holder.close();
  }
});

test('startOwned registers the server, listenerInfo sees it, stop takes the whole tree down', async () => {
  const file = registry();
  const { port } = await findFreePort();
  const server = startOwned({ command: process.execPath, args: SERVER(port), label: 'test-server', port, registryFile: file });
  started.push(server);
  assert.equal(await waitForUrl(`http://127.0.0.1:${port}/`, 15000, server.child, { port }), true);
  assert.equal(isOwned(server.pid, { registryFile: file }), true);
  assert.equal(listOwned({ registryFile: file })[0].label, 'test-server');
  assert.equal(listenerInfo(port)?.pid, server.pid);
  const result = await stopOwned(server.pid, { registryFile: file });
  assert.equal(result.stopped, true);
  assert.equal(isAlive(server.pid), false);
  assert.equal(isOwned(server.pid, { registryFile: file }), false);
  assert.equal(await isPortFree(port), true);
});

test('stop works from the handle even when the registry entry is lost', async () => {
  const file = registry();
  const { port } = await findFreePort();
  const server = startOwned({ command: process.execPath, args: SERVER(port), port, registryFile: file });
  started.push(server);
  assert.equal(await waitForUrl(`http://127.0.0.1:${port}/`, 15000, server.child), true);
  fs.rmSync(file, { force: true });
  assert.equal((await server.stop()).stopped, true);
  assert.equal(isAlive(server.pid), false);
});

test('stopOwned and releasePort refuse a process the toolkit did not start', async () => {
  const file = registry();
  const { port } = await findFreePort();
  const other = foreign(SERVER(port));
  assert.equal(await waitForUrl(`http://127.0.0.1:${port}/`, 15000), true);
  const refused = await stopOwned(other.pid, { registryFile: file });
  assert.deepEqual([refused.stopped, refused.reason], [false, 'not-owned']);
  const ask = await releasePort(port, { registryFile: file });
  assert.equal(ask.released, false);
  assert.equal(ask.reason, 'not-owned');
  assert.equal(ask.listener.pid, other.pid);
  assert.match(ask.ask, /Ask the user/);
  assert.equal(isAlive(other.pid), true, 'still running');
  const wrong = await releasePort(port, { registryFile: file, approvedPid: other.pid + 1 });
  assert.equal(wrong.released, false, 'approval must name the exact listener pid');
  assert.equal(isAlive(other.pid), true);
  const approved = await releasePort(port, { registryFile: file, approvedPid: other.pid });
  assert.equal(approved.released, true);
  assert.equal(approved.approved, true);
});

test('an approved foreign pid is signalled alone: its process group and children are never touched', { skip: !POSIX }, async () => {
  const file = registry();
  const { port } = await findFreePort();
  // A group leader (the listener) with a child in its group, like `cmd1 & cmd2` in a shell.
  const leaderSource = `const {spawn}=require('child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);require('http').createServer((q,r)=>r.end('ok')).listen(${port},'127.0.0.1');`;
  const leader = spawn(process.execPath, ['-e', leaderSource], { stdio: ['ignore', 'pipe', 'ignore'], detached: true });
  foreigners.push(leader);
  const childPid = Number(await new Promise((resolve) => leader.stdout.once('data', (data) => resolve(String(data).trim()))));
  assert.equal(await waitForUrl(`http://127.0.0.1:${port}/`, 15000), true);
  try {
    const result = await releasePort(port, { registryFile: file, approvedPid: leader.pid });
    assert.equal(result.released, true);
    assert.equal(isAlive(leader.pid), false);
    assert.equal(isAlive(childPid), true, 'the approved process was signalled alone; its group member lives');
  } finally {
    try {
      process.kill(childPid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
});

test('stopOwned and the registry never accept pid 0, 1 or a garbage entry', async () => {
  const file = registry();
  for (const bad of [0, 1, -1]) assert.equal((await stopOwned(bad, { registryFile: file })).reason, 'invalid-pid');
  fs.writeFileSync(file, JSON.stringify({ schema: 1, processes: [{ pid: 1, token: null }, { pid: 0 }, { pid: -1 }, { pid: 'x' }, { pid: process.pid + 7, ownerPid: 1 }] }));
  assert.deepEqual(listOwned({ registryFile: file }), []);
  assert.deepEqual(await cleanupOwned({ registryFile: file, all: true }), []);
});

test('a corrupt registry is set aside, not silently overwritten', () => {
  const file = registry();
  fs.writeFileSync(file, '{ not json');
  assert.deepEqual(listOwned({ registryFile: file }), []);
  assert.ok(fs.readdirSync(path.dirname(file)).some((name) => name.includes('.corrupt-')));
});

test('a recycled pid (token mismatch) is not ours: stopOwned leaves it alone, the handle still stops its own server', async () => {
  const file = registry();
  const { port } = await findFreePort();
  const server = startOwned({ command: process.execPath, args: SERVER(port), port, registryFile: file });
  started.push(server);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.processes[0].token = 'not-the-same-process';
  fs.writeFileSync(file, JSON.stringify(data));
  assert.equal(isOwned(server.pid, { registryFile: file }), false);
  const result = await stopOwned(server.pid, { registryFile: file });
  assert.equal(result.reason, 'pid-reused');
  assert.equal(isAlive(server.pid), true, 'the impostor is left alone');
  assert.equal((await server.stop()).stopped, true, 'the handle remembers the real start token');
});

test('an entry with no readable token is trusted only while the run that started it is alive', async () => {
  const file = registry();
  const other = foreign(['-e', 'setInterval(()=>{},1000)']);
  fs.writeFileSync(file, JSON.stringify({ schema: 1, processes: [{ pid: other.pid, port: null, label: 'x', token: null, ownerPid: 2 ** 22 + 4321 }] }));
  assert.equal(isOwned(other.pid, { registryFile: file }), false);
  assert.equal((await stopOwned(other.pid, { registryFile: file })).stopped, false);
  assert.equal(isAlive(other.pid), true);
});

test('cleanupOwned stops servers whose starting run is gone, leaves live runs alone, and --all stops everything', async () => {
  const file = registry();
  const { port } = await findFreePort();
  const orphan = startOwned({ command: process.execPath, args: SERVER(port), port, registryFile: file });
  const second = await findFreePort();
  const mine = startOwned({ command: process.execPath, args: SERVER(second.port), port: second.port, registryFile: file });
  started.push(orphan, mine);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.processes.find((entry) => entry.pid === orphan.pid).ownerPid = 2 ** 22 + 12345; // a run that is not alive
  data.processes.push({ pid: 2 ** 22 + 999, port: 1, label: 'dead', token: null, ownerPid: 1 });
  fs.writeFileSync(file, JSON.stringify(data));
  const results = await cleanupOwned({ registryFile: file });
  assert.deepEqual(results.map((entry) => entry.pid), [orphan.pid]);
  assert.equal(isAlive(orphan.pid), false);
  assert.equal(isAlive(mine.pid), true, 'the run that started it is still alive');
  const all = await cleanupOwned({ registryFile: file, all: true });
  assert.deepEqual(all.map((entry) => entry.pid), [mine.pid]);
  assert.deepEqual(listOwned({ registryFile: file }), []);
});

test('descendants that outlive the leader are stopped too (a wrapper exits, the real server stays)', { skip: !POSIX }, async () => {
  const file = registry();
  const source = `const {spawn}=require('child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);setTimeout(()=>process.exit(0),300);`;
  const server = startOwned({ command: process.execPath, args: ['-e', source], stdio: ['ignore', 'pipe', 'ignore'], registryFile: file });
  const childPid = Number(await new Promise((resolve) => server.child.stdout.once('data', (data) => resolve(String(data).trim()))));
  await new Promise((resolve) => server.child.once('exit', resolve));
  assert.equal(isAlive(server.pid), false, 'the leader is gone');
  assert.equal(isAlive(childPid), true, 'its child is not');
  assert.deepEqual(listOwned({ registryFile: file }).map((entry) => entry.pid), [server.pid], 'the orphaned group is still ours');
  const result = await stopOwned(server.pid, { registryFile: file });
  assert.equal(result.stopped, true);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(isAlive(childPid), false);
});

test('releasePort stops a listener that is a descendant of an owned server (sh -c node ...)', { skip: !POSIX }, async () => {
  const file = registry();
  const { port } = await findFreePort();
  const script = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(SERVER(port)[1])} & wait`;
  const server = startOwned({ command: 'sh', args: ['-c', script], port, registryFile: file });
  started.push(server);
  assert.equal(await waitForUrl(`http://127.0.0.1:${port}/`, 15000), true);
  assert.notEqual(listenerInfo(port).pid, server.pid, 'the listener is the shell\'s child');
  const result = await releasePort(port, { registryFile: file });
  assert.equal(result.owned, true);
  assert.equal(result.released, true);
  assert.equal(await isPortFree(port), true);
});

test('Ctrl+C / SIGTERM of the toolkit process stops the servers it started', { skip: !POSIX }, async () => {
  const file = registry();
  const module = pathToFileURL(path.resolve('Web_Toolkit/shared/lib/dev-server.mjs')).href;
  const runner = `import { startOwned } from ${JSON.stringify(module)};const s=startOwned({command:process.execPath,args:['-e','setInterval(()=>{},1000)'],registryFile:${JSON.stringify(file)}});console.log(s.pid);setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', runner], { stdio: ['ignore', 'pipe', 'inherit'] });
  foreigners.push(child);
  const serverPid = Number(await new Promise((resolve) => child.stdout.once('data', (data) => resolve(String(data).trim()))));
  assert.equal(isAlive(serverPid), true);
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(isAlive(serverPid), false, 'the server did not outlive the interrupted run');
});

test('startOwned does not crash on a command that cannot start', () => {
  assert.throws(() => startOwned({ command: 'definitely-not-a-real-command-xyz', registryFile: registry() }), /Could not start/);
});

test('withPort rewrites every port flag form and only appends when asked', () => {
  assert.deepEqual(withPort(['run', 'preview', '--host', '127.0.0.1', '--port', '4321'], 5000), ['run', 'preview', '--host', '127.0.0.1', '--port', '5000']);
  assert.deepEqual(withPort(['--port=4321'], 5000), ['--port=5000']);
  assert.deepEqual(withPort(['-p', '4321'], 5000), ['-p', '5000']);
  assert.deepEqual(withPort(['dev'], 5000), ['dev']);
  assert.deepEqual(withPort(['dev'], 5000, { append: true }), ['dev', '--port', '5000']);
});
