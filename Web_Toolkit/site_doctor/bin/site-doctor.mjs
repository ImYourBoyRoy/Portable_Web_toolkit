#!/usr/bin/env node
// ./Web_Toolkit/site_doctor/bin/site-doctor.mjs
/**
 * Unified local + Cloudflare diagnostics entrypoint for the portable toolkit.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runSiteDoctor } from '../src/commands/run.mjs';
import { runSiteDoctorDiff } from '../src/commands/diff.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'site-doctor',
    summary: 'Unified portable site diagnostics',
    usage: [
      'site-doctor run --site-profile <profile> [--project-root <path>]',
      'site-doctor diff --site-profile <profile> [--project-root <path>]'
    ],
    commands: [
      { name: 'run', description: 'Run workstation, project, local preview, live quality, browser, integration, and Cloudflare diagnostics as one triage pass.' },
      { name: 'diff', description: 'Compare the two latest site-doctor reports for the same project root.' }
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Portable site profile JSON for the target site.' },
      { name: '--project-root <path>', description: 'Override the project root from the site profile.' },
      { name: '--skip-agent-env', description: 'Skip workstation prerequisite checks.' },
      { name: '--skip-preview-smoke', description: 'Skip the local preview launch/probe cycle.' },
      { name: '--skip-quality-smoke', description: 'Skip live headers/SEO/cache smoke checks.' },
      { name: '--skip-browser-diagnostics', description: 'Skip live browser console/request/runtime diagnostics.' },
      { name: '--skip-brand-doctor', description: 'Skip branding/meta asset diagnostics.' },
      { name: '--browser-lighthouse', description: 'Also run Lighthouse through the browser-diagnostics step.' },
      { name: '--browser-lighthouse-preset <mobile|desktop>', description: 'Select the Lighthouse preset forwarded to browser-diagnostics.' },
      { name: '--browser-screenshots', description: 'Capture screenshots during the browser-diagnostics step.' },
      { name: '--pagespeed', description: 'Also run Google PageSpeed Insights diagnostics.' },
      { name: '--pagespeed-strategy <mobile|desktop|both>', description: 'Select the PageSpeed strategy set when --pagespeed is enabled.' },
      { name: '--skip-integration-doctor', description: 'Skip env/integration readiness checks.' },
      { name: '--skip-cloudflare', description: 'Skip all Cloudflare API-based checks.' },
      { name: '--skip-email', description: 'Skip email-specific Cloudflare audit steps.' }
    ],
    examples: [
      'site-doctor run --site-profile ../site-profiles/example-workers.json',
      'site-doctor run --site-profile ../site-profiles/example-workers.json --skip-cloudflare',
      'site-doctor diff --site-profile ../site-profiles/example-workers.json'
    ],
    notes: [
      'This is the best first-stop command when the model needs root-cause analysis without guessing.',
      'Browser diagnostics are non-mutating and can be skipped if Playwright/browser tooling is unavailable.'
    ],
    exitCodes: [
      { name: '0', description: 'All steps passed.' },
      { name: '2', description: 'One or more steps returned warnings but not hard failures.' },
      { name: '1', description: 'One or more steps failed.' }
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
  if (primary === 'run') return runSiteDoctor(flags);
  if (primary === 'diff') return runSiteDoctorDiff(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[site-doctor] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

