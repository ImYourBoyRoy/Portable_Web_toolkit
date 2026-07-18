#!/usr/bin/env node
// ./Web_Toolkit/package_updater/bin/package-updater.mjs
/**
 * CLI entrypoint for package.json updater to latest versions.
 * Preserves existing range operators (^, ~, >=, …); defaults to ^.
 */

import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { runPackageUpdate } from '../src/commands/update.mjs';

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
    name: 'package-updater',
    summary: 'Check package.json dependencies and update them to the latest registry versions (preserves ^ / ~ / >= operators).',
    usage: [
      'package-updater run --project-root <path> [--apply]',
    ],
    commands: [
      {
        name: 'run',
        description: 'Verify current package versions and check npm registry for updates.',
      },
    ],
    flags: [
      { name: '--project-root <path>', description: 'Target project root directory.' },
      { name: '--apply', description: 'Write updated version ranges back to package.json.' },
    ],
    examples: [
      'package-updater run --project-root .',
      'package-updater run --project-root . --apply',
    ],
    notes: [
      'Queries the official npm registry to find the latest stable version of each package.',
      'Preserves the existing range operator on each pin (^, ~, >=, >, <=, <, =); defaults to ^ when none is present.',
      'TypeScript is capped at the latest 6.x while @astrojs/check peers only allow ^5 || ^6.',
      'Use engines.node with >= for runtime floors (e.g. ">=26"); use ^ for npm dependencies.',
    ],
    exitCodes: [
      { name: '0', description: 'Check completed successfully (with or without updates).' },
      { name: '1', description: 'Error occurred during processing (e.g., missing package.json).' },
    ],
  });
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const primary = String(command[0] || 'help').toLowerCase();
  if (['help', '--help', '-h'].includes(primary)) {
    printHelp();
    return 0;
  }
  if (primary === 'run') return runPackageUpdate(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error('[package-updater]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
