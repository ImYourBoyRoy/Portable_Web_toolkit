#!/usr/bin/env node
// ./Web_Toolkit/site_snapshots/bin/site-snapshots.mjs
/**
 * CLI entrypoint for site-snapshots: keep "latest look" screenshots of other sites (client work, products) current.
 */

import { parseCliArgs } from '../../shared/lib/cli.mjs';
import { runCapture } from '../src/commands/capture.mjs';
import { runCheck } from '../src/commands/check.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'site-snapshots',
    summary: 'Capture and verify up-to-date screenshots of live pages for portfolio and showcase sections',
    usage: [
      'site-snapshots capture --project-root <path> [--only <id>] [--stale-only] [--apply]',
      'site-snapshots check --project-root <path>'
    ],
    commands: [
      { name: 'capture', description: 'Photograph each page in the config, write <outputDir>/<id>.jpg and the manifest. Only visibly changed pages are rewritten. Dry run unless --apply.' },
      { name: 'check', description: 'Compare stored snapshots with the live pages and report missing, stale and drifted ones. Writes nothing.' }
    ],
    flags: [
      { name: '--project-root <path>', description: 'Site root (config, source JSON, playwright and sharp resolve from here). Defaults to cwd.' },
      { name: '--config <path>', description: 'Config file. Defaults to site-snapshots.config.json in the project root.' },
      { name: '--only <id>', description: 'Capture a single item.' },
      { name: '--stale-only', description: 'Skip snapshots newer than maxAgeDays.' },
      { name: '--allow-loopback', description: 'Permit localhost/127.0.0.1 targets (local preview). Private LAN hosts stay blocked.' },
      { name: '--apply', description: 'Write images and the manifest.' }
    ],
    examples: [
      'site-snapshots capture --project-root . --apply',
      'site-snapshots capture --project-root . --only iridescent-cosmetics --apply',
      'site-snapshots check --project-root .'
    ],
    notes: [
      'A failed capture never replaces a good image. Items marked "skip": true in the source are ignored.',
      'Use the generated images through the framework image pipeline (for example import.meta.glob in Astro) so they are optimized.',
      'Needs playwright (Chromium) and sharp in the project.'
    ],
    exitCodes: [
      { name: '0', description: 'All snapshots captured or current.' },
      { name: '2', description: 'Some captures failed, or check found missing/stale/drifted snapshots.' },
      { name: '1', description: 'Unhandled failure or missing config/runtime.' }
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
  if (primary === 'capture') return runCapture(flags);
  if (primary === 'check') return runCheck(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[site-snapshots] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
