// ./Web_Toolkit/site_readiness/src/lib/exec.mjs
/**
 * Child-process helpers for site-readiness orchestration.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolvePortableRoot } from '../../../shared/lib/context.mjs';

export const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);

export function runToolkitScript(scriptRelativePath, args = [], options = {}) {
  const toolkitRoot = options.toolkitRoot || PORTABLE_ROOT;
  const scriptPath = path.isAbsolute(scriptRelativePath)
    ? scriptRelativePath
    : path.join(toolkitRoot, scriptRelativePath);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    env: options.env || process.env,
    stdio: 'pipe',
  });
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    scriptPath,
  };
}

export function parseJsonStdout(result) {
  const chunks = [String(result.stdout || ''), String(result.stderr || '')];
  for (const text of chunks) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}$/);
      if (!match) continue;
      try {
        return JSON.parse(match[0]);
      } catch {
        /* try next chunk */
      }
    }
  }
  return null;
}

export function statusFromExitCode(exitCode) {
  if (exitCode === 0) return 'pass';
  if (exitCode === 2) return 'warn';
  return 'fail';
}
