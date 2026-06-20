#!/usr/bin/env node
// ./Web_Toolkit/init_site_profile/bin/init-site-profile.mjs
/**
 * CLI entrypoint for site profile creation and requirements guidance.
 *
 * Run `node ./bin/init-site-profile.mjs requirements` to see what the AI
 * should ask for, or `create` with flags to write a new profile JSON file.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runCreate, runRequirements } from '../src/commands/init.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'init-site-profile',
    summary: 'Create portable site profiles',
    usage: [
      'init-site-profile requirements',
      'init-site-profile create --site-id <id> --project-root <path> --deploy-target workers|pages --zone <name> --prod-hosts a.com,www.a.com [--dev-hosts dev.a.com] [--output <path>]'
    ],
    commands: [
      { name: 'requirements', description: 'Print the information an AI should gather from the user before it can generate a complete site profile.' },
      { name: 'create', description: 'Write a new profile JSON from supplied business, host, deploy, and Cloudflare details.' }
    ],
    flags: [
      { name: '--site-id <id>', description: 'Stable short identifier used in reports and profile filenames.' },
      { name: '--project-root <path>', description: 'Target project root.' },
      { name: '--deploy-target <workers|pages>', description: 'Primary Cloudflare deploy style.' },
      { name: '--zone <name>', description: 'Cloudflare zone name, usually the production domain.' },
      { name: '--prod-hosts <csv>', description: 'Production hosts such as apex and www.' },
      { name: '--dev-hosts <csv>', description: 'Optional development/staging hosts such as dev.example.com.' },
      { name: '--output <path>', description: 'Optional explicit output path for the created profile JSON.' }
    ],
    examples: [
      'init-site-profile requirements',
      'init-site-profile create --site-id bakery --project-root C:/sites/bakery --deploy-target workers --zone bakery.com --prod-hosts bakery.com,www.bakery.com --dev-hosts dev.bakery.com'
    ],
    notes: [
      'The AI model should act as the intake wizard and ask only for missing details.',
      'Site-specific secrets belong in the project root .env, not in the profile JSON.'
    ],
    exitCodes: [
      { name: '0', description: 'Profile created or requirements printed successfully.' },
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
  if (primary === 'requirements') return runRequirements(flags);
  if (primary === 'create') return runCreate(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[init-site-profile] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

