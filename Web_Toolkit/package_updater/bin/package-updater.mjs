#!/usr/bin/env node
// ./Web_Toolkit/package_updater/bin/package-updater.mjs
/**
 * CLI entrypoint for package.json updater to latest versions.
 * Preserves existing range operators (^, ~, >=, …); defaults to ^.
 * Astro projects also run `npx @astrojs/upgrade` (dry-run unless --apply).
 */

import { parseCliArgs as sharedParseCliArgs } from '../../shared/lib/cli.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { runPackageUpdate } from '../src/commands/update.mjs';
import { runStarters } from '../src/commands/starters.mjs';
import { runMigrate } from '../src/commands/migrate.mjs';

function parseCliArgs(argv = []) {
  const { command, flags } = sharedParseCliArgs(argv);
  return { command, flags };
}

function printHelp() {
  return printStandardHelp({
    name: 'package-updater',
    summary: 'Peer-aware toolchain updates: newest compatible dependency ranges, Astro via its official upgrader, verified or rolled back.',
    usage: [
      'package-updater run --project-root <path> [--apply] [--skip-astro-upgrade] [--astro-tag <tag>] [--package-manager pnpm|npm|yarn|bun] [--skip-install] [--skip-verify]',
      'package-updater migrate [--to pnpm] --project-root <path> [--apply] [--allow-builds a,b] [--deny-builds c,d] [--skip-install] [--skip-verify]',
      'package-updater refresh-starters [--apply] [--offline]',
      'package-updater doctor [--offline] [--strict]',
    ],
    commands: [
      {
        name: 'run',
        description: 'Official @astrojs/upgrade for Astro, then resolve the newest compatible ranges; --apply writes, installs, verifies (check + build), and restores on failure.',
      },
      { name: 'migrate', description: 'Convert a site from npm/yarn/bun to pnpm in place: pnpm import, pnpm-workspace.yaml (allowBuilds, overrides), rewritten scripts, install + verify; any failure restores every file. Dry-run unless --apply.' },
      { name: 'refresh-starters', description: 'Resolve the toolkit starters and templates the same way (dry-run unless --apply). Schedule it so new sites start current.' },
      { name: 'doctor', description: 'Lint starters/templates (no exact pins, valid ranges, engine floors) and report drift behind the registry.' },
    ],
    flags: [
      { name: '--project-root <path>', description: 'Target project root directory.' },
      { name: '--apply', description: 'Apply @astrojs/upgrade (not dry-run) and write updated pin ranges to package.json.' },
      { name: '--skip-astro-upgrade', description: 'Skip the official @astrojs/upgrade step (pins only).' },
      { name: '--astro-tag <tag>', description: 'Dist-tag for @astrojs/upgrade (default: latest). Example: beta.' },
      { name: '--package-manager <name>', description: 'pnpm (default when installed), npm, yarn, or bun. Detected from the lockfile otherwise.' },
      { name: '--allow-builds <csv> / --deny-builds <csv>', description: 'migrate: trust (allow) or block (deny) dependency install scripts pnpm reports; the install fails closed on any it was not told about.' },
      { name: '--json', description: 'run: print one JSON plan (changes, holds with blockers, lift conditions and options, accepted risks) on stdout; progress goes to stderr.' },
      { name: '--skip-install', description: 'Write ranges only; no install and no verification.' },
      { name: '--skip-verify', description: 'Install but do not run the project check/build scripts.' },
      { name: '--offline', description: 'refresh-starters/doctor: lint only, no registry access.' },
      { name: '--strict', description: 'doctor: exit 2 when starters are behind the registry.' },
    ],
    examples: [
      'package-updater run --project-root .',
      'package-updater run --project-root . --apply',
      'package-updater run --project-root . --apply --astro-tag latest',
      'package-updater run --project-root . --skip-astro-upgrade --apply',
    ],
    notes: [
      'Nothing is pinned exactly. The resolver picks the newest set whose peerDependencies/dependencies agree; a package held back (typescript 6.x while @astrojs/check peers ^5 || ^6) is printed with its reason and lifts itself on the first run after a release that allows the new major.',
      'Astro majors: @astrojs/upgrade runs first; if an integration has no release for the new Astro major, Astro holds on the previous major and the laggard is named.',
      'Policy: package_updater/policy.json (anchors, documented holds, ignore, acceptPeerConflicts) plus an optional toolchain.policy.json in the project. A hold or an accepted risk needs a reason.',
      "For a held package the report names the blocker, what its newest release declares, when the hold lifts, and the options (wait, accept the risk in policy with the user's approval, replace the laggard). Explain these to the user; do not silently force a major.",
      'Preserves the existing range operator on each range (^ default, ~ kept, >= kept and bounded below a held-back major).',
      'Use engines.node with >= for runtime floors (e.g. ">=26"); use ^ for npm dependencies.',
    ],
    exitCodes: [
      { name: '0', description: 'Check/upgrade completed successfully (with or without updates).' },
      { name: '1', description: 'Missing package.json, registry failure, @astrojs/upgrade failure, or install/verify failure (files restored).' },
      { name: '2', description: 'doctor: lint problems (or drift with --strict).' },
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
  if (primary === 'migrate') return runMigrate(flags);
  if (primary === 'refresh-starters' || primary === 'doctor') return runStarters(primary, flags);
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
