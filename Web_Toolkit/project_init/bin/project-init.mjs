#!/usr/bin/env node
// ./Web_Toolkit/project_init/bin/project-init.mjs
/**
 * Non-destructive project bootstrap entrypoint.
 *
 * Use this for fresh or partially-built website folders when you want the
 * toolkit to find missing basics, optionally create safe starter files, and
 * avoid overwriting anything that already exists.
 */

import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { runApplySafe, runAudit } from '../src/commands/init.mjs';

function parseCliArgs(argv = []) {
  const command = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      command.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function printHelp() {
  return printStandardHelp({
    name: 'project-init',
    summary: 'Non-destructive project bootstrap and hole-finding',
    usage: [
      'project-init audit [--project-root <path>] [--site-profile <profile>]',
      'project-init apply-safe [--project-root <path>] [--site-profile <profile>] [--project-name <name>] [--install-deps]'
    ],
    commands: [
      { name: 'audit', description: 'Inspect a project folder and report what exists, what is missing, and what should happen next.' },
      { name: 'apply-safe', description: 'Create only missing safe starter files such as README.md, MEMORY.md, .gitignore, and .env.example.' }
    ],
    flags: [
      { name: '--project-root <path>', description: 'Target project root. Defaults to the current working directory.' },
      { name: '--site-profile <path>', description: 'Optional site profile used to enrich env templates and readiness checks.' },
      { name: '--project-name <name>', description: 'Optional display name used in generated starter docs.' },
      { name: '--output-root <path>', description: 'Optional report output root. Defaults to portable runtime for audit and project output/ for apply-safe.' },
      { name: '--install-deps', description: 'If package.json exists and node_modules is missing, allow setup tooling to install dependencies.' }
    ],
    examples: [
      'project-init audit --project-root C:/sites/new-client',
      'project-init apply-safe --project-root C:/sites/new-client --project-name "New Client Website"',
      'project-init audit --project-root . --site-profile Web_Toolkit/site-profiles/example-workers.json'
    ],
    notes: [
      'Default behavior is non-destructive.',
      'Existing files are left alone unless a tool-specific safe refresh is explicitly allowed.'
    ],
    exitCodes: [
      { name: '0', description: 'Command completed successfully.' },
      { name: '1', description: 'Unhandled failure.' }
    ]
  });
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const primary = String(command[0] || 'audit').toLowerCase();
  if (['help', '--help', '-h'].includes(primary) || flags.help || flags.h) {
    printHelp();
    return 0;
  }
  if (primary === 'audit') return runAudit(flags);
  if (primary === 'apply-safe') return runApplySafe(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[project-init] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

