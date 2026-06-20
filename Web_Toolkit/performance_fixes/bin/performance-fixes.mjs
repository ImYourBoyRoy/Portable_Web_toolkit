#!/usr/bin/env node
// ./Web_Toolkit/performance_fixes/bin/performance-fixes.mjs
/**
 * CLI entrypoint for source-level performance fix helpers.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runImmutableCache } from '../src/commands/immutable-cache.mjs';
import { runRecommend } from '../src/commands/recommend.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'performance-fixes',
    summary: 'Source-level performance remediation helpers',
    usage: [
      'performance-fixes recommend --site-profile <profile>',
      'performance-fixes immutable-cache --project-root <path> [--apply]'
    ],
    commands: [
      { name: 'recommend', description: 'Read the latest reports and print concrete recommended next actions for the agent.' },
      { name: 'immutable-cache', description: 'Create or update public/_headers so hashed /_astro/* assets are long-cached and immutable.' }
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Portable site profile JSON for the target site.' },
      { name: '--project-root <path>', description: 'Override the project root from the site profile.' },
      { name: '--apply', description: 'Actually write source changes. Without this flag the tool stays in dry-run mode.' }
    ],
    examples: [
      'performance-fixes recommend --site-profile ../site-profiles/example-workers.json',
      'performance-fixes immutable-cache --project-root C:/sites/client-app --apply'
    ],
    notes: [
      'These fixes change project source/config files, not live Cloudflare settings directly.',
      'Use dev deploy + smoke tests before promoting any performance fix to production.'
    ],
    exitCodes: [
      { name: '0', description: 'Command completed successfully.' },
      { name: '1', description: 'Unhandled failure.' }
    ]
  });
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const primary = String(command[0] || 'help').toLowerCase();
  if (['help', '--help', '-h'].includes(primary)) {
    printHelp();
    return 0;
  }
  if (primary === 'recommend') return runRecommend(flags);
  if (primary === 'immutable-cache') return runImmutableCache(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[performance-fixes] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

