#!/usr/bin/env node
// ./Web_Toolkit/brand_doctor/bin/brand-doctor.mjs
/**
 * CLI entrypoint for brand-doctor.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runAudit } from '../src/commands/audit.mjs';
import { runGenerateOg } from '../src/commands/generate-og.mjs';
import { runGenerateIcons } from '../src/commands/generate-icons.mjs';
import { runRepairOg } from '../src/commands/repair-og.mjs';
import { runOgDoctor } from '../src/commands/og-doctor.mjs';
import { runSetupEnv } from '../src/commands/setup-env.mjs';
import { runSyncTokens } from '../src/commands/sync-tokens.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'brand-doctor',
    summary: 'Branding/meta audit and asset generation helper',
    usage: [
      'brand-doctor setup-env [--python <path>]',
      'brand-doctor audit --project-root <path> [--site-profile <profile>]',
      'brand-doctor sync-tokens --project-root <path> [--site-profile <profile>] [--apply]',
      'brand-doctor generate-og --project-root <path> [--spec <file>] [--config <file>] [--apply]',
      'brand-doctor generate-icons --project-root <path> [--spec <file>] [--config <file>] [--apply]',
      'brand-doctor repair-og --project-root <path> --apply'
    ],
    commands: [
      { name: 'setup-env', description: 'Bootstrap the Python environment (preferring pyenv-native managed venvs) and install dependencies.' },
      { name: 'audit', description: 'Check Open Graph metadata, icons, Brand Guide, and branding assets with design-integrity warnings.' },
      { name: 'sync-tokens', description: 'Map Brand Guide hex colors into src/styles/tokens.css (and optional profile branding.colors). Dry-run unless --apply.' },
      { name: 'generate-og', description: 'Generate a declarative OG image from JSON spec/config or site discovery.' },
      { name: 'generate-icons', description: 'Generate site icons (Favicons, Apple, Maskable) from SVG or raster sources.' },
      { name: 'repair-og', description: 'Re-encode malformed OG assets as valid PNGs.' },
      { name: 'og-doctor', description: 'Audit and preview OpenGraph metadata for 2026 standards.' }
    ],
    flags: [
      { name: '--project-root <path>', description: 'Target project root.' },
      { name: '--site-profile <path>', description: 'Optional site profile (sync-tokens can patch branding.colors).' },
      { name: '--config <path>', description: 'Path to brand-doctor.config.json.' },
      { name: '--spec <path>', description: 'Path to og.spec.json or icon.spec.json.' },
      { name: '--apply', description: 'Actually write output assets / tokens.' },
      { name: '--python <path>', description: 'Explicit Python interpreter for setup-env.' },
      { name: '--source <image>', description: 'Override source for icon generation.' },
      { name: '--title <text>', description: 'Override OG title.' },
      { name: '--subtitle <text>', description: 'Override OG subtitle.' },
      { name: '--eyebrow <text>', description: 'Override OG eyebrow text.' }
    ],
    examples: [
      'brand-doctor audit --project-root C:/sites/client-app',
      'brand-doctor sync-tokens --project-root C:/sites/client-app',
      'brand-doctor sync-tokens --project-root C:/sites/client-app --site-profile ./site.site-profile.json --apply',
      'brand-doctor generate-og --project-root C:/sites/client-app --apply',
      'brand-doctor generate-icons --project-root C:/sites/client-app --source C:/sites/client-app/public/assets/logo.png --apply',
      'brand-doctor repair-og --project-root C:/sites/client-app --apply'
    ],
    notes: [
      'Brand Guide (BRAND_GUIDE.md) wins on identity; sync-tokens writes a managed CSS block only.',
      'Open Graph assets intentionally stay PNG/JPG by default rather than converting to WebP.',
      'If source branding art is too small, the toolkit should surface exact dimensions so the model can ask for a better source or offer an AI-expanded replacement.'
    ],
    exitCodes: [
      { name: '0', description: 'Command completed successfully.' },
      { name: '2', description: 'Audit warnings detected / missing Brand Guide for sync.' },
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
  if (primary === 'setup-env') {
    await runSetupEnv(flags);
    return 0;
  }
  if (primary === 'audit') return runAudit(flags);
  if (primary === 'sync-tokens') return runSyncTokens(flags);
  if (primary === 'generate-og') return runGenerateOg(flags);
  if (primary === 'generate-icons') return runGenerateIcons(flags);
  if (primary === 'repair-og') return runRepairOg(flags);
  if (primary === 'og-doctor') return runOgDoctor(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[brand-doctor] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

