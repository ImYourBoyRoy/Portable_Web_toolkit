// ./Web_Toolkit/Setup_agent_environment/src/lib/exec.mjs
/**
 * Cross-platform child-process helpers for host setup checks and repairs.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const WINDOWS_CMD_NAMES = new Set(['npm', 'npx', 'pnpm', 'corepack']);
const WINDOWS_WINGET_BINARIES = {
  pnpm: { packagePrefix: 'pnpm.pnpm_', executable: 'pnpm.exe' },
  bun: { packagePrefix: 'Oven-sh.Bun_', executable: 'bun-windows-x64/bun.exe' },
  uv: { packagePrefix: 'astral-sh.uv_', executable: 'uv.exe' }
};

function winGetExecutable(command) {
  if (process.platform !== 'win32') return '';
  const definition = WINDOWS_WINGET_BINARIES[String(command || '').toLowerCase()];
  if (!definition) return '';
  const packagesRoot = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (!packagesRoot || !fs.existsSync(packagesRoot)) return '';
  const match = fs.readdirSync(packagesRoot, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.startsWith(definition.packagePrefix));
  if (!match) return '';
  const fullPath = path.join(packagesRoot, match.name, ...definition.executable.split('/'));
  return fs.existsSync(fullPath) ? fullPath : '';
}

export function resolveCommand(command) {
  const wingetBinary = winGetExecutable(command);
  if (wingetBinary) return wingetBinary;
  if (process.platform === 'win32' && WINDOWS_CMD_NAMES.has(command.toLowerCase()) && !command.toLowerCase().endsWith('.cmd')) {
    return `${command}.cmd`;
  }
  return command;
}

export function runCommand(command, args = [], options = {}) {
  const resolved = resolveCommand(command);
  const baseOptions = {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    shell: options.shell === true,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe'
  };
  const result = process.platform === 'win32' && resolved.toLowerCase().endsWith('.cmd')
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', resolved, ...args], { ...baseOptions, shell: false })
    : spawnSync(resolved, args, baseOptions);
  const status = typeof result.status === 'number' ? result.status : 1;
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  if (options.throwOnError !== false && status !== 0) {
    const detail = stderr.trim() || stdout.trim() || `Command exited with status ${status}`;
    throw new Error(`${resolved} ${args.join(' ')} failed: ${detail}`);
  }
  return { status, stdout, stderr, command: resolved };
}

export function commandAvailable(command, args = ['--version']) {
  try {
    runCommand(command, args, { throwOnError: true });
    return true;
  } catch {
    return false;
  }
}

