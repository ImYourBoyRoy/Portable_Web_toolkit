#!/usr/bin/env node
// ./Web_Toolkit/cloudflare-agent-toolkit/bin/cf-deploy-pages.mjs
import { printHelp } from '../../shared/lib/help.mjs';
import { resolvePortableRoot } from '../../shared/lib/context.mjs';
import { parseDeployFlags } from '../src/lib/deploy/context.mjs';
import { runDeployPages } from '../src/lib/deploy/pages.mjs';

const flags = parseDeployFlags(process.argv.slice(2));
if (flags.help || flags.h) {
  printHelp({
    name: 'cf-deploy-pages',
    summary: 'Deploy the target site to Cloudflare Pages using its site profile (production mutation).',
    usage: ['cf-deploy-pages --site-profile <profile> [--project-root <path>] [--project-name <name>] [--apply]'],
    flags: [
      { name: '--site-profile <path>', description: 'Portable site profile JSON for the target site.' },
      { name: '--project-root <path>', description: 'Override the project root from the site profile.' },
      { name: '--project-name <name>', description: 'Override the Cloudflare Pages project name.' },
      { name: '--apply', description: 'Perform the deploy; without it the command only reports what would run.' },
      { name: '--help', description: 'Show this help and exit 0 without deploying.' }
    ],
    exitCodes: [{ name: '0', description: 'Deploy (or dry run) succeeded.' }, { name: '1', description: 'Deploy failed or arguments were invalid.' }]
  });
  process.exit(0);
}

resolvePortableRoot(import.meta.url, 2);
process.exit(runDeployPages(flags));
