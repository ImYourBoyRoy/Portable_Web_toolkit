#!/usr/bin/env node
// ./Web_Toolkit/browser_diagnostics/bin/browser-diagnostics.mjs
/**
 * CLI entrypoint for browser-diagnostics.
 *
 * Runs real-browser diagnostics against live production/development hosts using
 * Python Playwright, with optional Lighthouse probing for deeper scoring.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runBrowserDiagnostics } from '../src/commands/run.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'browser-diagnostics',
    summary: 'Live browser diagnostics via Playwright with optional Lighthouse',
    usage: [
      'browser-diagnostics run --site-profile <profile> [--project-root <path>]',
      'browser-diagnostics run --site-profile <profile> --screenshots --lighthouse'
    ],
    commands: [
      { name: 'run', description: 'Open live pages in a real browser, collect console/request/runtime metrics, optionally capture screenshots, and optionally run Lighthouse.' }
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Portable site profile JSON for the target site.' },
      { name: '--project-root <path>', description: 'Override the project root from the site profile.' },
      { name: '--include-development <true|false>', description: 'Include the development host in diagnostics. Defaults to true.' },
      { name: '--timeout-ms <ms>', description: 'Navigation timeout per route.' },
      { name: '--settle-ms <ms>', description: 'Post-load wait for performance observers and late beacons.' },
      { name: '--headed', description: 'Launch Chromium headed instead of headless.' },
      { name: '--screenshots', description: 'Capture screenshots for each checked route.' },
      { name: '--lighthouse', description: 'Run an additional Lighthouse pass for the production root URL.' },
      { name: '--lighthouse-preset <mobile|desktop>', description: 'Choose the Lighthouse preset. Defaults to mobile.' },
      { name: '--skip-playwright-install', description: 'Do not soft-install Python Playwright/Chromium when missing.' }
    ],
    examples: [
      'browser-diagnostics run --site-profile ../site-profiles/example-workers.json',
      'browser-diagnostics run --site-profile ../site-profiles/example-workers.json --screenshots --lighthouse'
    ],
    notes: [
      'Uses Python Playwright. Soft-ensures the package + Chromium unless --skip-playwright-install.',
      'Setup_agent_environment can also provision Playwright in the managed pyenv venv.',
      'This tool is non-mutating and designed to surface browser/runtime issues before publish or after live changes.'
    ],
    exitCodes: [
      { name: '0', description: 'No issues detected.' },
      { name: '2', description: 'Warnings detected.' },
      { name: '1', description: 'Unhandled failure or missing browser runtime support.' }
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
  if (primary === 'run') return runBrowserDiagnostics(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[browser-diagnostics] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

