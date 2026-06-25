#!/usr/bin/env node
// ./scripts/install-agent-skills.mjs
/**
 * Cross-platform entry: Windows/macOS/Linux via PowerShell 7+ or bash.
 *
 * Usage:
 *   node ./scripts/install-agent-skills.mjs
 *   node ./scripts/install-agent-skills.mjs -- --Agent cursor -Scope user
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const extraArgs = process.argv.slice(2).filter((a) => a !== '--');
const defaultPsArgs = ['-RepoRoot', repoRoot, '-Agent', 'all'];
const defaultShArgs = ['--repo-root', repoRoot, '--agent', 'all'];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: repoRoot, shell: false });
  process.exit(result.status ?? 1);
}

const ps1 = path.join(__dirname, 'install-agent-skills.ps1');
const sh = path.join(__dirname, 'install-agent-skills.sh');

if (process.env.PWT_INSTALLER === 'bash' && fs.existsSync(sh)) {
  run('bash', [sh, ...(extraArgs.length ? extraArgs : defaultShArgs)]);
}

if (fs.existsSync(ps1)) {
  const pwsh = process.env.PWSH_PATH || 'pwsh';
  const psArgs = ['-NoLogo', '-NoProfile', '-File', ps1, ...(extraArgs.length ? extraArgs : defaultPsArgs)];
  const result = spawnSync(pwsh, psArgs, { stdio: 'inherit', cwd: repoRoot, shell: false });
  if (result.error?.code === 'ENOENT' && fs.existsSync(sh)) {
    run('bash', [sh, ...(extraArgs.length ? extraArgs : defaultShArgs)]);
  }
  process.exit(result.status ?? 1);
}

if (fs.existsSync(sh)) {
  run('bash', [sh, ...(extraArgs.length ? extraArgs : defaultShArgs)]);
}

console.error('[install-agent-skills] No installer script found.');
process.exit(1);
