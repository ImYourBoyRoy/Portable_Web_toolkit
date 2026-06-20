// ./Web_Toolkit/site_doctor/src/lib/exec.mjs
/**
 * Child-process helpers for orchestrating portable doctor commands.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PORTABLE_ROOT } from './paths.mjs';

export function runNodeScript(scriptRelativePath, args = [], options = {}) {
  const scriptPath = path.join(PORTABLE_ROOT, scriptRelativePath);
  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: options.cwd || PORTABLE_ROOT,
    encoding: 'utf8',
    env: options.env || process.env
  });
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    scriptPath
  };
}

