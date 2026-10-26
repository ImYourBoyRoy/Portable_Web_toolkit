#!/usr/bin/env node
// ./Web_Toolkit/sourcing_doctor/bin/sourcing-doctor.mjs
/**
 * Sourcing Doctor CLI — import/audit legacy CMS content (WordPress REST, public Wix).
 *
 * Usage:
 *   sourcing-doctor audit --site-profile <path> [--project-root <path>]
 *   sourcing-doctor extract --site-profile <path> [--project-root <path>]
 *
 * Wix harvest uses public storefront HTML + JSON-LD (no admin keys).
 * Project root is inferred from the site profile when omitted.
 */

import { printHelp } from '../../shared/lib/help.mjs';
import { loadSiteProfileContext, resolvePortableRoot } from '../../shared/lib/context.mjs';
import { runExtract } from '../src/commands/extract.mjs';
import { runWixExtract } from '../src/commands/extract-wix.mjs';
import { assertPublicHttpUrl } from '../../shared/lib/url-safety.mjs';
import { fetchWixHtml, normalizeOrigin } from '../src/lib/wix/client.mjs';

function parseArgs(argv) {
  const command = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        index += 1;
      }
    } else {
      command.push(token);
    }
  }
  return { command, flags };
}

function showHelp() {
  printHelp({
    name: 'sourcing-doctor',
    summary: 'Import/audit legacy CMS content sources',
    usage: [
      'sourcing-doctor audit --site-profile <path> [--project-root <path>]',
      'sourcing-doctor extract --site-profile <path> [--project-root <path>]'
    ],
    commands: [
      { name: 'audit', description: 'Check that the configured WordPress REST or public Wix storefront is reachable.' },
      { name: 'extract', description: 'Harvest content, URL map, and optional media into the project.' },
      { name: 'help', description: 'Show this help.' }
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Site profile JSON (required). Reads profile.sourcing.' },
      { name: '--project-root <path>', description: 'Override project root from the site profile.' }
    ],
    examples: [
      'sourcing-doctor audit --site-profile ./site.site-profile.json',
      'sourcing-doctor extract --site-profile ./site.site-profile.json --project-root .'
    ],
    notes: [
      'profile.sourcing.type = wordpress | wix (squarespace is reserved, not implemented).',
      'Wix uses public HTML + JSON-LD only. Rate-limit with profile.sourcing.delayMs (default 900).',
      'Wix categoryRules, pages, shopPaths, and phone belong in the site profile — not in this CLI.',
      'Do not store API tokens in the profile. WordPress uses the public REST API.'
    ],
    exitCodes: [
      { name: '0', description: 'Audit passed or extract completed.' },
      { name: '1', description: 'Usage error, unsupported type, or audit/extract failure.' }
    ]
  });
}

async function auditWordpress(profile) {
  console.log(`[INFO] Audit mode: Checking ${profile.sourcing?.url} for WordPress API readiness...`);
  const apiUrl = assertPublicHttpUrl(`${profile.sourcing.url}/wp-json/wp/v2/posts?per_page=1`, 'WordPress API URL').href;
  const response = await fetch(apiUrl);
  if (response.ok) {
    console.log('[PASS] WordPress REST API is active and accessible.');
    return 0;
  }
  console.error(`[FAIL] WordPress REST API returned ${response.status}.`);
  return 1;
}

async function auditWix(profile) {
  const origin = normalizeOrigin(profile.sourcing.url);
  console.log(`[INFO] Audit mode: Checking ${origin} for a public Wix storefront...`);
  const html = await fetchWixHtml(origin, { delayMs: 200, retries: 3 });
  const isWix = /Wix\.com Website Builder/i.test(html) || /static\.wixstatic\.com/i.test(html);
  const prefix = String(profile.sourcing?.productPathPrefix || '/product-page/');
  const hasProducts = html.toLowerCase().includes(prefix.toLowerCase());
  if (!isWix) {
    console.error('[FAIL] Page does not look like a Wix site.');
    return 1;
  }
  if (!hasProducts) {
    console.error(`[FAIL] Wix site detected, but no ${prefix} catalog links were found on the origin URL.`);
    return 1;
  }
  console.log('[PASS] Public Wix storefront with product pages is reachable.');
  return 0;
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const primary = String(command[0] || '').toLowerCase();

  if (!primary || ['help', '--help', '-h'].includes(primary)) {
    showHelp();
    process.exit(primary ? 0 : 1);
  }

  const portableRoot = resolvePortableRoot(import.meta.url, 2);
  const { profile, projectRoot } = loadSiteProfileContext({
    portableRoot,
    flags,
    requireProfile: true
  });

  const sourceType = String(profile.sourcing?.type || '').toLowerCase();
  if (!sourceType) {
    console.error('[ERROR] Site profile is missing sourcing.type (wordpress | wix).');
    process.exit(1);
  }

  if (primary === 'extract') {
    if (sourceType === 'wordpress') {
      await runExtract(profile, projectRoot);
      process.exit(0);
    }
    if (sourceType === 'wix') {
      await runWixExtract(profile, projectRoot);
      process.exit(0);
    }
    console.error(`[ERROR] Sourcing type "${profile.sourcing?.type}" is not implemented yet.`);
    process.exit(1);
  }

  if (primary === 'audit') {
    if (sourceType === 'wordpress') process.exit(await auditWordpress(profile));
    if (sourceType === 'wix') process.exit(await auditWix(profile));
    console.error(`[ERROR] Sourcing type "${profile.sourcing?.type}" is not implemented yet.`);
    process.exit(1);
  }

  console.error(`Unknown command: ${primary}`);
  showHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error('[UNHANDLED ERROR]', err instanceof Error ? err.message : err);
  process.exit(1);
});
