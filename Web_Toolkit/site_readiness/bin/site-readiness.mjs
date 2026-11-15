#!/usr/bin/env node
// ./Web_Toolkit/site_readiness/bin/site-readiness.mjs
/**
 * Sandbox-aware run-all readiness pass for client Astro sites.
 */

import { parseCliArgs as sharedParseCliArgs } from '../../shared/lib/cli.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { runSiteReadiness } from '../src/commands/run.mjs';

function parseCliArgs(argv = []) {
  const { command, flags } = sharedParseCliArgs(argv);
  return { command, flags };
}

function printHelp() {
  return printStandardHelp({
    name: 'site-readiness',
    summary: 'Run-all data collection with next-step report (sandbox-aware)',
    usage: [
      'site-readiness run --project-root <path> [--site-profile <profile>]',
      'site-readiness run --project-root <path> --apply-safe-fixes [--install-deps]',
      'site-readiness run --project-root <path> --build --skip-network',
    ],
    commands: [
      {
        name: 'run',
        description: 'Probe environment, run phased local checks, write JSON + Markdown report under output/.',
      },
    ],
    flags: [
      { name: '--project-root <path>', description: 'Target client site root (default: cwd).' },
      { name: '--site-profile <path>', description: 'Optional site profile path.' },
      { name: '--apply-safe-fixes', description: 'Run project-init apply-safe before checks (non-destructive).' },
      { name: '--install-deps', description: 'Allow apply-safe / astro fix to install dependencies.' },
      { name: '--build', description: 'Include npm run build in the pass (slower).' },
      { name: '--skip-network', description: 'Skip integration doctor and other network checks.' },
    ],
    examples: [
      'site-readiness run --project-root .',
      'site-readiness run --project-root . --site-profile ./my-site.site-profile.json --apply-safe-fixes',
      'site-readiness run --project-root . --build --skip-network',
    ],
    notes: [
      'Detects sandbox vs local vs full access (network + Cloudflare .env keys).',
      'For live production triage after deploy, use site-doctor run instead.',
      'Exit 0 = pass, 2 = warnings, 1 = failures.',
    ],
    exitCodes: [
      { name: '0', description: 'All executed steps passed.' },
      { name: '2', description: 'Warnings only.' },
      { name: '1', description: 'One or more hard failures.' },
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
  if (primary === 'run') return runSiteReadiness(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error('[site-readiness]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
