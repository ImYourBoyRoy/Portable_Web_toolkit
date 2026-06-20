#!/usr/bin/env node
// ./Web_Toolkit/image_pipeline/bin/image-pipeline.mjs
/**
 * CLI entrypoint for image-pipeline.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runAudit } from '../src/commands/audit.mjs';
import { runOptimize } from '../src/commands/optimize.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'image-pipeline',
    summary: 'Raster image audit and lossless WebP conversion helper',
    usage: [
      'image-pipeline audit --project-root <path> [--site-profile <profile>]',
      'image-pipeline optimize --project-root <path> [--apply] [--replace-references]'
    ],
    commands: [
      { name: 'audit', description: 'Audit JPG/PNG assets under public/ for format mismatches, dimensions, and WebP eligibility.' },
      { name: 'optimize', description: 'Convert eligible JPG/PNG assets to lossless WebP. OG and icon assets are excluded by default.' }
    ],
    flags: [
      { name: '--project-root <path>', description: 'Target project root.' },
      { name: '--site-profile <path>', description: 'Optional site profile used to resolve the project root.' },
      { name: '--apply', description: 'Actually write .webp files. Without this flag the command stays in dry-run mode.' },
      { name: '--replace-references', description: 'Update source references from original asset paths to .webp siblings after conversion.' }
    ],
    examples: [
      'image-pipeline audit --project-root C:/sites/client-app',
      'image-pipeline optimize --project-root C:/sites/client-app --apply --replace-references'
    ],
    notes: [
      'Open Graph and branding/icon assets stay PNG/JPG by default unless you explicitly handle them through brand-doctor.',
      'This tool uses Python Pillow and expects WebP support to be available.'
    ],
    exitCodes: [
      { name: '0', description: 'Command completed successfully.' },
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
  if (primary === 'audit') return runAudit(flags);
  if (primary === 'optimize') return runOptimize(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[image-pipeline] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

