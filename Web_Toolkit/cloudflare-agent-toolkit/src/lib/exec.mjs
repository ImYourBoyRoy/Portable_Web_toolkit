// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/exec.mjs
/**
 * Child-process execution helpers for CLI orchestration.
 *
 * Wraps synchronous and streaming command execution with consistent return
 * shapes and optional strict failure behavior.
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const WINDOWS_CMD_NAMES = new Set(['npm', 'npx', 'astro', 'tsx', 'wrangler']);

export function resolveCommand(command) {
  if (process.platform === 'win32' && WINDOWS_CMD_NAMES.has(command.toLowerCase()) && !command.toLowerCase().endsWith('.cmd')) {
    return `${command}.cmd`;
  }
  return command;
}

export function runCommand(command, args, options = {}) {
  const resolved = resolveCommand(command);
  const baseOptions = {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    shell: false,
    encoding: 'utf8'
  };
  const result = process.platform === 'win32' && resolved.toLowerCase().endsWith('.cmd')
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', resolved, ...args], baseOptions)
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

