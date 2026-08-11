#!/usr/bin/env node
// ./Web_Toolkit/init_site_profile/bin/init-site-profile.mjs
/**
 * CLI entrypoint for site profile creation and requirements guidance.
 *
 * Run `node ./bin/init-site-profile.mjs requirements` to see what the AI
 * should ask for, or `create` with flags to write a new profile JSON file
 * into the **client project** by default.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runCreate, runRequirements } from '../src/commands/init.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'init-site-profile',
    summary: 'Create portable site profiles in the client project (agent intake helper)',
    usage: [
      'init-site-profile requirements [--json]',
      'init-site-profile create --site-id <id> --project-root <path> --deploy-target workers|pages --zone <name> --prod-hosts a.com,www.a.com [options]'
    ],
    commands: [
      { name: 'requirements', description: 'Print the agent intake checklist (use --json for structured output).' },
      { name: 'create', description: 'Write <project-root>/<site-id>.site-profile.json from supplied flags.' }
    ],
    flags: [
      { name: '--site-id <id>', description: 'Required. Stable short identifier used in reports and profile filenames.' },
      { name: '--project-root <path>', description: 'Required. Client project root. Default output is written here.' },
      { name: '--deploy-target <workers|pages>', description: 'Required. Primary Cloudflare deploy style.' },
      { name: '--zone <name>', description: 'Required. Cloudflare zone name (usually the production domain).' },
      { name: '--prod-hosts <csv>', description: 'Required. Production hosts such as apex and www.' },
      { name: '--dev-hosts <csv>', description: 'Optional development/staging hosts.' },
      { name: '--registrar <name>', description: 'Current registrar (any provider; Porkbun is one optional toolkit example).' },
      { name: '--dns-provider <name>', description: 'Current DNS provider (default metadata: cloudflare).' },
      { name: '--email-enabled <true|false>', description: 'Whether the domain receives email.' },
      { name: '--email-provider <name>', description: 'Mailbox provider when email is active.' },
      { name: '--account-id <id>', description: 'Cloudflare account id (agent may look up after API token).' },
      { name: '--account-name <name>', description: 'Cloudflare account display name.' },
      { name: '--worker-prod <name>', description: 'Workers production name (default: <siteId>-app).' },
      { name: '--worker-dev <name>', description: 'Workers development name (default: <siteId>-app-dev).' },
      { name: '--pages-project <name>', description: 'Pages project name (default: <siteId>).' },
      { name: '--deploy-dev <cmd>', description: 'Override staging deploy command.' },
      { name: '--deploy-prod <cmd>', description: 'Override production deploy command.' },
      { name: '--output <path>', description: 'Optional explicit output path. Default: <project-root>/<site-id>.site-profile.json' },
      { name: '--json', description: 'With requirements: print structured JSON for agents.' }
    ],
    examples: [
      'init-site-profile requirements',
      'init-site-profile requirements --json',
      'init-site-profile create --site-id bakery --project-root /sites/bakery --deploy-target workers --zone bakery.com --prod-hosts bakery.com,www.bakery.com --dev-hosts staging.bakery.com --worker-prod bakery-web'
    ],
    notes: [
      'Default write location is the CLIENT project, not Web_Toolkit/site-profiles/.',
      'Toolkit site-profiles/ is for public examples only — use --output only when intentionally adding an example.',
      'The AI model should act as the intake wizard: propose names, challenge vague answers, ask only for missing details.',
      'Site-specific secrets belong in the project root .env, not in the profile JSON.'
    ],
    exitCodes: [
      { name: '0', description: 'Profile created or requirements printed successfully.' },
      { name: '1', description: 'Unhandled failure.' },
      { name: '2', description: 'Missing/invalid create flags.' }
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
