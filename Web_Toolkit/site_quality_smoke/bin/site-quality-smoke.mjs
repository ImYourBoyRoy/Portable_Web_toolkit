#!/usr/bin/env node
// ./Web_Toolkit/site_quality_smoke/bin/site-quality-smoke.mjs
/**
 * CLI entrypoint for site-quality-smoke.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runQualitySmoke } from '../src/commands/run.mjs';
import { runQualitySmokeDiff } from '../src/commands/diff.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function help() {
  return printStandardHelp({
    name: 'site-quality-smoke',
    summary: 'SEO/performance/header smoke tests plus legal, cookies, image-format, and font checks',
    usage: [
      'site-quality-smoke run --site-profile <profile> [--project-root <path>]',
      'site-quality-smoke diff --site-profile <profile> [--project-root <path>]'
    ],
    commands: [
      { name: 'run', description: 'Check redirects, headers, robots/sitemap, timings, OG, legal/privacy, cookies notice, on-page image formats, and remote fonts.' },
      { name: 'diff', description: 'Compare the two latest quality-smoke reports for the same project root.' }
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Portable site profile JSON for the target site.' },
      { name: '--project-root <path>', description: 'Override the project root from the site profile.' }
    ],
    examples: [
      'site-quality-smoke run --site-profile ../site-profiles/example-workers.json',
      'site-quality-smoke diff --site-profile ../site-profiles/example-workers.json'
    ],
    notes: [
      'This tool is non-mutating and live-host focused.',
      'Compliance checks parse root HTML (best-effort); JS-only cookie banners may need browser-diagnostics.',
      'Prefer WebP/AVIF/SVG on-page; OG social images may still be PNG/JPEG.',
      'It is a strong smoke signal, not a full Lighthouse replacement.'
    ],
    exitCodes: [
      { name: '0', description: 'No issues detected.' },
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
  if (primary === 'run') return runQualitySmoke(flags);
  if (primary === 'diff') return runQualitySmokeDiff(flags);
  help();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[site-quality-smoke] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

