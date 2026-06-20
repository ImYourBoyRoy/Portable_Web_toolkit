// ./Web_Toolkit/browser_diagnostics/src/lib/exec.mjs
/**
 * Child-process helpers for browser-diagnostics.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { TOOL_ROOT } from './paths.mjs';

const WINDOWS_CMD_NAMES = new Set(['npx', 'npm']);

function resolveCommand(command) {
  if (process.platform === 'win32' && WINDOWS_CMD_NAMES.has(String(command || '').toLowerCase()) && !String(command).toLowerCase().endsWith('.cmd')) {
    return `${command}.cmd`;
  }
  return command;
}

function run(command, args = [], options = {}) {
  const resolved = resolveCommand(command);
  const result = process.platform === 'win32' && resolved.toLowerCase().endsWith('.cmd')
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', resolved, ...args], {
        cwd: options.cwd,
        env: options.env || process.env,
        encoding: 'utf8',
        stdio: options.stdio || 'pipe',
        shell: false
      })
    : spawnSync(resolved, args, {
        cwd: options.cwd,
        env: options.env || process.env,
        encoding: 'utf8',
        stdio: options.stdio || 'pipe',
        shell: false
      });
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || '')
  };
}

export function runPythonDiagnostics(configPath, cwd) {
  const scriptPath = path.join(TOOL_ROOT, 'src', 'python', 'browser_diagnostics', 'main.py');
  return run('python', [scriptPath, '--config', configPath], { cwd });
}

export function runLighthouse(url, outputPath, tempDir, cwd, extraEnv = {}, preset = 'mobile') {
  fs.mkdirSync(tempDir, { recursive: true });
  return run('npx', [
    '--yes',
    'lighthouse',
    url,
    '--quiet',
    '--preset',
    preset,
    '--output',
    'json',
    '--output-path',
    outputPath,
    '--chrome-flags',
    `--headless=new --no-sandbox --disable-dev-shm-usage --user-data-dir=${path.join(tempDir, 'chrome-profile')}`
  ], {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
      TMP: tempDir,
      TEMP: tempDir,
      TMPDIR: tempDir
    }
  });
}

