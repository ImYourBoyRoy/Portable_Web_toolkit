#!/usr/bin/env node
// ./Web_Toolkit/integration_doctor/bin/integration-doctor.mjs
/**
 * CLI entrypoint for integration-doctor.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runIntegrationDoctor } from '../src/commands/run.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function help() {
  return printStandardHelp({
    name: 'integration-doctor',
    summary: 'Env/live integration diagnostics',
    usage: [
      'integration-doctor run --site-profile <profile> [--project-root <path>]'
    ],
    commands: [
      { name: 'run', description: 'Validate env key documentation, live analytics/forms/auth markers, email warnings, and Cloudflare token visibility.' }
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Portable site profile JSON for the target site.' },
      { name: '--project-root <path>', description: 'Override the project root from the site profile.' }
    ],
    examples: [
      'integration-doctor run --site-profile ../site-profiles/example-workers.json'
    ],
    notes: [
      'Project-root .env is preferred for live site secrets; Web_Toolkit/.env is only an optional machine-defaults fallback.',
      'This tool is non-mutating and designed to help the model ask only for missing business details.'
    ],
    exitCodes: [
      { name: '0', description: 'No integration issues detected.' },
      { name: '2', description: 'Warnings detected.' },
      { name: '1', description: 'Unhandled failure.' }
    ]
  });
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const primary = String(command[0] || 'help').toLowerCase();
  if (['help', '--help', '-h'].includes(primary)) {
    help();
    return 0;
  }
  if (primary === 'run') return runIntegrationDoctor(flags);
  help();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[integration-doctor] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});


