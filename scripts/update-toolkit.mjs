#!/usr/bin/env node
// ./scripts/update-toolkit.mjs
/**
 * Cross-platform toolkit update: git pull, reinstall skills, verify.
 *
 * Usage:
 *   node ./scripts/update-toolkit.mjs
 *   node ./scripts/update-toolkit.mjs -- --Agent cursor
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const extraArgs = process.argv.slice(2).filter((a) => a !== '--');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: repoRoot, shell: false });
  process.exit(result.status ?? 1);
}

const ps1 = path.join(__dirname, 'update-toolkit.ps1');
const sh = path.join(__dirname, 'update-toolkit.sh');

if (process.env.PWT_INSTALLER === 'bash' && fs.existsSync(sh)) {
  run('bash', [sh, '--repo-root', repoRoot, ...extraArgs]);
}

if (fs.existsSync(ps1)) {
  const pwsh = process.env.PWSH_PATH || 'pwsh';
  const result = spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-File', ps1, ...extraArgs], {
    stdio: 'inherit',
    cwd: repoRoot,
    shell: false,
  });
  if (result.error?.code === 'ENOENT' && fs.existsSync(sh)) {
    run('bash', [sh, '--repo-root', repoRoot, ...extraArgs]);
  }
  process.exit(result.status ?? 1);
}

if (fs.existsSync(sh)) {
  run('bash', [sh, '--repo-root', repoRoot, ...extraArgs]);
}

console.error('[update-toolkit] No update script found.');
process.exit(1);
