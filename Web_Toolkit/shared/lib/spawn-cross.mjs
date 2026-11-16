// ./Web_Toolkit/shared/lib/spawn-cross.mjs
/**
 * Spawning that works the same on Linux, macOS and Windows.
 *
 * On Windows, `pnpm`, `npm`, `npx`, `yarn` and `wrangler` are `.cmd` shims. Node refuses to spawn a `.cmd`/`.bat` without a shell
 * (EINVAL since the 2024 security fixes) and a bare `pnpm` is ENOENT, while `shell: true` mangles arguments such as
 * `github:owner/repo#semver:>=2` (`>` is a redirect, `^` the escape character). So a shim is run as
 * `cmd.exe /d /s /c "<quoted command line>"` with verbatim arguments, which is exactly what cmd expects. Everything else
 * (real executables, every command on macOS and Linux) is spawned directly with no shell.
 */

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const SHIMS = new Set(['npm', 'npx', 'pnpm', 'pnpx', 'yarn', 'corepack', 'wrangler', 'astro', 'tsc', 'playwright']);

/** True when `command` must go through cmd.exe on this platform. */
export function needsShell(command, platform = process.platform) {
  if (platform !== 'win32') return false;
  const name = String(command ?? '').toLowerCase();
  if (/\.(cmd|bat)$/.test(name)) return true;
  return !/[\\/]/.test(name) && path.extname(name) === '' && SHIMS.has(name);
}

/** One argument as cmd.exe will read it: bare when it is plain, otherwise quoted with `"` doubled. */
export function quoteForCmd(arg) {
  const text = String(arg);
  if (text === '') return '""';
  return /^[\w@+=:,./\\-]+$/.test(text) ? text : `"${text.replace(/"/g, '""')}"`;
}

/** The [command, args, options] to hand to spawn/spawnSync for this platform. */
export function resolveSpawn(command, args = [], options = {}, platform = process.platform, comSpec = process.env.ComSpec || 'cmd.exe') {
  if (!needsShell(command, platform)) return { command, args, options };
  const line = [command, ...args].map(quoteForCmd).join(' ');
  return { command: comSpec, args: ['/d', '/s', '/c', `"${line}"`], options: { ...options, windowsVerbatimArguments: true, shell: false } };
}

export function spawnCross(command, args = [], options = {}) {
  const resolved = resolveSpawn(command, args, options);
  return spawn(resolved.command, resolved.args, resolved.options);
}

export function spawnSyncCross(command, args = [], options = {}) {
  const resolved = resolveSpawn(command, args, options);
  return spawnSync(resolved.command, resolved.args, resolved.options);
}
