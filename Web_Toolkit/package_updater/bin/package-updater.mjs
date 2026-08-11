#!/usr/bin/env node
// ./Web_Toolkit/package_updater/bin/package-updater.mjs
/**
 * CLI entrypoint for package.json updater to latest versions.
 * Preserves existing range operators (^, ~, >=, …); defaults to ^.
 * Astro projects also run `npx @astrojs/upgrade` (dry-run unless --apply).
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
    summary: 'Update package.json dependency pins from the npm registry, and for Astro projects run npx @astrojs/upgrade.',
    usage: [
      'package-updater run --project-root <path> [--apply] [--skip-astro-upgrade] [--astro-tag <tag>]',
    ],
    commands: [
      {
        name: 'run',
        description: 'Run @astrojs/upgrade when Astro is detected, then check/update remaining package pins.',
      },
    ],
    flags: [
      { name: '--project-root <path>', description: 'Target project root directory.' },
      { name: '--apply', description: 'Apply @astrojs/upgrade (not dry-run) and write updated pin ranges to package.json.' },
      { name: '--skip-astro-upgrade', description: 'Skip the official @astrojs/upgrade step (pins only).' },
      { name: '--astro-tag <tag>', description: 'Dist-tag for @astrojs/upgrade (default: latest). Example: beta.' },
    ],
    examples: [
      'package-updater run --project-root .',
      'package-updater run --project-root . --apply',
      'package-updater run --project-root . --apply --astro-tag latest',
      'package-updater run --project-root . --skip-astro-upgrade --apply',
    ],
    notes: [
      'Astro projects (astro dependency and/or astro.config.*) run `npx --yes @astrojs/upgrade` first; dry-run unless --apply.',
      'Then queries the official npm registry for each remaining dependency pin.',
      'Preserves the existing range operator on each pin (^, ~, >=, >, <=, <, =); defaults to ^ when none is present.',
      'TypeScript is capped at the latest 6.x while @astrojs/check peers only allow ^5 || ^6.',
      'Use engines.node with >= for runtime floors (e.g. ">=26"); use ^ for npm dependencies.',
      'After --apply, run `npm install` if the lockfile still needs refresh.',
    ],
    exitCodes: [
      { name: '0', description: 'Check/upgrade completed successfully (with or without updates).' },
      { name: '1', description: 'Missing package.json, registry fetch failure, or @astrojs/upgrade failure.' },
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
