#!/usr/bin/env node
// ./Web_Toolkit/cache_purge/bin/cache-purge.mjs
/**
 * Portable Astro-oriented cache purge utility for Cloudflare-backed sites.
 *
 * Run: node ./Web_Toolkit/cache_purge/bin/cache-purge.mjs --site-profile <profile> [--apply]
 *      node ./Web_Toolkit/cache_purge/bin/cache-purge.mjs warm --site-profile <profile> [--apply]
 * Logic lives in ../src (commands/purge.mjs, commands/warm.mjs, lib/urls.mjs, lib/cloudflare.mjs);
 * this file only parses arguments, prints help, and dispatches.
 */

import process from 'node:process';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { loadSiteProfileContext, resolvePortableRoot } from '../../shared/lib/context.mjs';
import { runCacheWarm } from '../src/commands/warm.mjs';
import { runPurge } from '../src/commands/purge.mjs';

const portableRoot = resolvePortableRoot(import.meta.url, 2);

function parseArgs(argv) {
  const command = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      command.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function printHelp() {
  return printStandardHelp({
    name: 'cache-purge',
    summary: 'Targeted Astro/Cloudflare cache purge helper',
    usage: [
      'cache-purge --site-profile <profile> [--project-root <path>] [--environment production|development] [--mode url|hostname|prefix|everything]',
      'cache-purge --site-profile <profile> --urls https://example.com/,https://example.com/app.js --apply',
      'cache-purge warm --site-profile <profile> [--project-root <path>] [--apply]'
    ],
    commands: [
      { name: 'warm', description: 'GET-warm profile production/development hosts plus diagnostics.qualitySmoke.routes (dry-run by default).' },
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Portable site profile JSON for the target site.' },
      { name: '--project-root <path>', description: 'Override the project root from the site profile.' },
      { name: '--environment <production|development>', description: 'Select which profile hosts should be purged. Defaults from the site profile.' },
      { name: '--mode <url|hostname|prefix|everything>', description: 'Choose the purge strategy. URL is safest and preferred.' },
      { name: '--urls <csv>', description: 'Explicit URL list for URL or prefix purges. Otherwise the built public folder is sampled (dist/client for the Astro Workers adapter, else dist/).' },
      { name: '--batch-size <n>', description: 'Items per Cloudflare request (default 100, max 500). Also cloudflare.cachePurge.batchSize or CF_CACHE_PURGE_BATCH_SIZE.' },
      { name: '--include-assets', description: 'Also purge content-hashed /_astro/ files (skipped by default: their names change with their content).' },
      { name: '--no-variants', description: 'Do not add the slashless twin of each directory URL (/about/ and /about).' },
      { name: '--apply', description: 'Actually submit the purge. Without this flag the tool stays in dry-run mode.' }
    ],
    examples: [
      'cache-purge --site-profile ../site-profiles/example-workers.json',
      'cache-purge --site-profile ../site-profiles/example-workers.json --urls https://example.com/,https://example.com/_astro/app.js --apply',
      'cache-purge warm --site-profile ../site-profiles/example-workers.json',
      'cache-purge warm --site-profile ../site-profiles/example-workers.json --apply'
    ],
    notes: [
      'Live Cloudflare credentials should come from the project root .env when possible.',
      'Dry-run is the default for safety.',
      'Large purges are split into batches; HTTP 429 is retried after Cloudflare\'s Retry-After delay (Free plan: 5 purge requests per minute).',
      'SSR or API routes are not in dist/: list them in cloudflare.cachePurge.extraPaths in the site profile, or pass --urls.',
      'Prefix mode sends host/path prefixes without a scheme; a bare-host prefix purges the whole host.'
    ],
    exitCodes: [
      { name: '0', description: 'Dry-run or purge completed successfully.' },
      { name: '1', description: 'Nothing to purge, zone not resolved, Cloudflare rejected a batch, or unhandled failure.' }
    ]
  });
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const primary = String(command[0] || '').toLowerCase();
  if (['help', '--help', '-h'].includes(primary) || flags.help) {
    printHelp();
    return 0;
  }
  if (primary === 'warm') {
    const site = loadSiteProfileContext({ portableRoot, flags });
    return runCacheWarm({ site, flags });
  }

  const site = loadSiteProfileContext({ portableRoot, flags });
  return runPurge({ site, flags });
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error('\n[cache-purge] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

