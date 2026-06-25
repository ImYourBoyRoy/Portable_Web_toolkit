#!/usr/bin/env node
// ./Web_Toolkit/stylesheet_check/bin/stylesheet-check.mjs
/**
 * CLI entrypoint for stylesheet architecture checks.
 *
 * Run `node ./bin/stylesheet-check.mjs scan --root <path>` to enforce externalized
 * CSS, token segregation, file size limits, and duplicate rule/token detection.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runScan } from '../src/commands/scan.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'stylesheet-check',
    summary: 'Audit external CSS architecture, token placement, and file size limits',
    usage: [
      'stylesheet-check scan --root <path> [--json] [--json-out <path>]',
      'stylesheet-check scan --root <path> [--max-inline-lines 15] [--max-file-lines 500]'
    ],
    commands: [
      {
        name: 'scan',
        description: 'Scan Astro/Svelte/Vue components and CSS files for inline style bloat, oversized stylesheets, token misuse, and duplicate CSS.'
      }
    ],
    flags: [
      { name: '--root <path>', description: 'Project root to scan. Defaults to the current working directory.' },
      { name: '--max-inline-lines <n>', description: 'Max meaningful lines allowed in a component <style> block. Default: 15.' },
      { name: '--max-file-lines <n>', description: 'Max meaningful lines allowed in one stylesheet file. Default: 500.' },
      { name: '--min-duplicate-rule-lines <n>', description: 'Minimum rule body size to consider for duplicate-rule detection. Default: 4.' },
      { name: '--json', description: 'Emit machine-readable JSON to stdout.' },
      { name: '--json-out <path>', description: 'Also write the JSON report to a file path.' }
    ],
    examples: [
      'stylesheet-check scan --root .',
      'stylesheet-check scan --root ./src --json-out ./output/stylesheet-check.json'
    ],
    notes: [
      'Aligns with AGENTS.md stylesheet rules: external CSS, tokens in tokens.css, ≤500 lines per file.',
      'Exit code 2 when errors or warnings are found; 0 when clean.'
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

main().then((code) => {
  process.exit(typeof code === 'number' ? code : 1);
}).catch((error) => {
  console.error('\n[stylesheet-check] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
