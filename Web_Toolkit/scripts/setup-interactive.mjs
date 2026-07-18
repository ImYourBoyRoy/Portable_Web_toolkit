#!/usr/bin/env node
// ./Web_Toolkit/scripts/setup-interactive.mjs
/**
 * Optional Node wrapper that delegates to the native setup wizards.
 *
 * End-user and coding-agent entry points are:
 *   - setup-interactive.sh  (macOS/Linux)
 *   - setup-interactive.ps1 (Windows)
 *
 * Those wizards do not require Node. Prefer them from launchers and agents.
 *
 * Usage:
 *   node ./Web_Toolkit/scripts/setup-interactive.mjs [--workspace <path>] [--yes|--agent]
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgv(argv) {
  const flags = { workspace: process.cwd(), yes: false };
  const passthrough = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--workspace' && argv[i + 1]) {
      flags.workspace = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--yes' || argv[i] === '--agent' || argv[i] === '--non-interactive') {
      flags.yes = true;
    } else {
      passthrough.push(argv[i]);
    }
  }
  return { flags, passthrough };
}

function main() {
  const { flags } = parseArgv(process.argv.slice(2));
  const args = ['--workspace', flags.workspace];
  if (flags.yes) args.push('--yes');

  if (process.platform === 'win32') {
    const ps1 = path.join(__dirname, 'setup-interactive.ps1');
    const shellArgs = ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Workspace', flags.workspace];
    if (flags.yes) shellArgs.push('-Yes');
    const pwsh = process.env.PWSH_PATH || 'pwsh';
    const result = spawnSync(pwsh, shellArgs, { stdio: 'inherit' });
    if (result.error) {
      const fallback = spawnSync('powershell.exe', shellArgs, { stdio: 'inherit' });
      process.exit(fallback.status ?? 1);
    }
    process.exit(result.status ?? 1);
  }

  const sh = path.join(__dirname, 'setup-interactive.sh');
  const result = spawnSync('bash', [sh, ...args], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

main();
