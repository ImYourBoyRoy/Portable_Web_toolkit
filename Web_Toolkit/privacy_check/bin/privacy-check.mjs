#!/usr/bin/env node
// ./Web_Toolkit/privacy_check/bin/privacy-check.mjs
/**
 * CLI entrypoint for privacy/sanitization scanning.
 *
 * Run `node ./bin/privacy-check.mjs scan --root <path>` to identify secrets,
 * personal paths, emails, and site-specific leftovers before sharing/export.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runScan } from '../src/commands/scan.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'privacy-check',
    summary: 'Scan for secrets and site-specific leftovers',
    usage: [
      'privacy-check scan --root <path> [--json] [--json-out <path>]'
    ],
    commands: [
      { name: 'scan', description: 'Inspect a directory tree for secrets, absolute personal paths, domains, emails, and site-specific artifacts before sharing.' }
    ],
    flags: [
      { name: '--root <path>', description: 'Target directory to scan. Defaults to the current working directory.' },
      { name: '--json', description: 'Emit machine-readable JSON to stdout.' },
      { name: '--json-out <path>', description: 'Also write the JSON report to a file path.' }
    ],
    examples: [
      'privacy-check scan --root C:/portable-toolkit-export',
      'privacy-check scan --root C:/portable-toolkit-export --json-out C:/reports/privacy-scan.json'
    ],
    notes: [
      'Run this before sharing the portable toolkit publicly or handing it to another client environment.'
    ],
    exitCodes: [
      { name: '0', description: 'No findings detected.' },
      { name: '2', description: 'Findings detected.' },
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
  if (primary === 'scan') return runScan(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[privacy-check] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

