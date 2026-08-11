#!/usr/bin/env node
// ./Web_Toolkit/cache_purge/bin/cache-purge.mjs
/**
 * Portable Astro-oriented cache purge utility for Cloudflare-backed sites.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { loadSiteProfileContext, resolvePortableRoot } from '../../shared/lib/context.mjs';
import { runCacheWarm } from '../src/commands/warm.mjs';

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
      { name: '--urls <csv>', description: 'Explicit URL list for URL or prefix purges. Otherwise dist/ is sampled automatically.' },
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
      'Dry-run is the default for safety.'
    ],
    exitCodes: [
      { name: '0', description: 'Dry-run or purge completed successfully.' },
      { name: '1', description: 'Unhandled failure.' }
    ]
  });
}

function collectDistUrls(projectRoot, hosts) {
  const distRoot = path.join(projectRoot, 'dist');
  if (!fs.existsSync(distRoot)) return [];
  const urls = [];
  const queue = [distRoot];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      const relative = path.relative(distRoot, fullPath).replace(/\\/g, '/');
      if (relative.endsWith('.map')) continue;
      const routePath = relative === 'index.html'
        ? '/'
        : `/${relative.replace(/index\.html$/, '')}`.replace(/\/+/g, '/');
      for (const host of hosts) {
        urls.push(`https://${host}${routePath}`);
      }
    }
  }
  return [...new Set(urls)];
}

async function resolveZoneId(token, zoneName) {
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}&per_page=50`, {
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    });
    const payload = await response.json();
    const zone = Array.isArray(payload?.result) ? payload.result[0] : null;

    if (!response.ok || !zone?.id) {
      console.warn(`[warn] Unable to resolve zone "${zoneName}". Skipping purge.`);
      return null;
    }
    return zone.id;
  } catch (error) {
    console.warn(`[warn] Zone resolution failed: ${error.message}`);
    return null;
  }
}

async function purge(token, zoneId, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(JSON.stringify(payload?.errors || payload || {}, null, 2));
  }
  return payload;
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
  const environment = String(flags.environment || site.profile.cloudflare?.cachePurge?.defaultEnvironment || 'production').toLowerCase();
  const mode = String(flags.mode || site.profile.cloudflare?.cachePurge?.defaultMode || site.env.CF_CACHE_PURGE_MODE || 'url').toLowerCase();
  const apply = ['1', 'true', 'yes', 'on'].includes(String(flags.apply || 'false').toLowerCase());
  const hosts = environment === 'development' ? site.developmentHosts : site.productionHosts;
  const token = String(site.env.CLOUDFLARE_API_TOKEN || '').trim();
  const zoneName = site.profile.zone.name;
  const urls = String(flags.urls || '').trim()
    ? String(flags.urls).split(',').map((entry) => entry.trim()).filter(Boolean)
    : collectDistUrls(site.projectRoot, hosts).slice(0, 100);

  const body = mode === 'everything'
    ? { purge_everything: true }
    : mode === 'hostname'
      ? { hosts }
      : mode === 'prefix'
        ? { prefixes: urls.map((entry) => entry.replace(/\/[^/]*$/, '/')) }
        : { files: urls };

  console.log('\ncache-purge');
  console.log(`- Profile: ${site.profile.siteId}`);
  console.log(`- Project root: ${site.projectRoot}`);
  console.log(`- Environment: ${environment}`);
  console.log(`- Mode: ${mode}`);
  console.log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);
  if (mode === 'url') {
    console.log(`- URLs prepared: ${urls.length}`);
  }

  if (!apply) {
    console.log('- Preview body:');
    console.log(JSON.stringify(body, null, 2));
    return 0;
  }

  if (!token) {
    throw new Error('Missing CLOUDFLARE_API_TOKEN in the project root .env, Web_Toolkit/.env, or shell env.');
  }

  const zoneId = await resolveZoneId(token, zoneName);
  if (zoneId) {
    await purge(token, zoneId, body);
    console.log(`- Purge submitted successfully for zone ${zoneName} (${zoneId})`);
  } else {
    console.log(`- Skipping purge: No active zone found for ${zoneName}.`);
  }
  return 0;
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error('\n[cache-purge] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

