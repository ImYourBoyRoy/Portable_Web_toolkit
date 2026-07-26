#!/usr/bin/env node
/**
 * Compatibility status entrypoint. Toolkit updates are agent-driven through
 * the toolkit-update skill and never reinstall skills as a side effect.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter((value) => value !== '--');
if (args.includes('--apply') || args.includes('-Apply')) {
  console.error(
    'Automated apply is retired. Use the toolkit-update skill for a staged, reviewed reconciliation.',
  );
  process.exit(2);
}

console.error('[update-toolkit] Read-only status; no source or skills will change.');
const version = spawnSync(
  process.execPath,
  [path.join(scriptsDir, 'check-toolkit-update.mjs'), '--json'],
  { stdio: 'inherit', shell: false },
);
const skills = spawnSync(
  process.execPath,
  [path.join(scriptsDir, 'check-agent-skills.mjs'), ...args],
  { stdio: 'inherit', shell: false },
);
process.exit(skills.status || version.status || 0);
