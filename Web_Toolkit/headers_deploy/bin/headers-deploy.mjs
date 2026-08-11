#!/usr/bin/env node
// ./Web_Toolkit/headers_deploy/bin/headers-deploy.mjs
/**
 * CLI entrypoint for Cloudflare Pages `_headers` scaffolding, deploy merge, and audits.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runScaffoldPublic } from '../src/commands/scaffold-public.mjs';
import { runWriteDeploy } from '../src/commands/write-deploy.mjs';
import { runAudit } from '../src/commands/audit.mjs';
import { runStack } from '../src/commands/stack.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'headers-deploy',
    summary: 'Cloudflare `_headers` cache baseline, deploy security merge, and audits',
    usage: [
      'headers-deploy scaffold-public --project-root <path> [--apply]',
      'headers-deploy write-deploy --project-root <path> --environment production|development',
      'headers-deploy audit --site-profile <profile>',
      'headers-deploy stack',
    ],
    commands: [
      { name: 'scaffold-public', description: 'Create or update managed cache rules in public/_headers (dry-run unless --apply).' },
      { name: 'write-deploy', description: 'Merge security headers + public/_headers into dist output after build.' },
      { name: 'audit', description: 'Audit public and dist _headers against the Zenith security baseline.' },
      { name: 'stack', description: 'Print the full recommended Cloudflare enhancement command sequence.' },
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Portable site profile JSON for the target site.' },
      { name: '--project-root <path>', description: 'Override the project root from the site profile.' },
      { name: '--environment <name>', description: 'production or development (controls dev noindex headers).' },
      { name: '--apply', description: 'Write changes. Both scaffold-public and write-deploy default to dry-run.' },
    ],
    examples: [
      'headers-deploy stack',
      'headers-deploy scaffold-public --project-root C:/sites/client --apply',
      'headers-deploy write-deploy --site-profile ./site-profiles/example-workers.json --environment production',
      'headers-deploy write-deploy --site-profile ./site-profiles/example-workers.json --environment production --apply',
      'headers-deploy audit --project-root C:/sites/client',
    ],
    notes: [
      'Pair with cf-agent site harden, rules audit, discovery-doctor, and site-quality-smoke for full Cloudflare posture.',
      'Configure CSP presets and dist output paths through cloudflare.headers in the site profile.',
    ],
    exitCodes: [
      { name: '0', description: 'Command completed successfully.' },
      { name: '1', description: 'Audit failure or unhandled error.' },
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
  if (primary === 'scaffold-public') return runScaffoldPublic(flags);
  if (primary === 'write-deploy') return runWriteDeploy(flags);
  if (primary === 'audit') return runAudit(flags);
  if (primary === 'stack') return runStack(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[headers-deploy] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
