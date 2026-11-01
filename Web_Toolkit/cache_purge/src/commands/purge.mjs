// ./Web_Toolkit/cache_purge/src/commands/purge.mjs
/**
 * Targeted Cloudflare cache purge: plan the URLs, show the plan, optionally submit it.
 *
 * Run via: node ./Web_Toolkit/cache_purge/bin/cache-purge.mjs --site-profile <profile> [--apply]
 * Inputs: loaded site profile context, CLI flags (`--mode`, `--urls`, `--environment`,
 * `--batch-size`, `--include-assets`, `--no-variants`, `--apply`).
 * Outputs: a plan summary on stdout and exit code 0 (planned or purged) or 1 (nothing to purge,
 * unresolved zone, or Cloudflare rejection, including how much was already purged).
 * Side effects: with `--apply`, POSTs to Cloudflare in batches. Dry-run is the default.
 */

import { CloudflarePurgeError, purgeBody, purgeInBatches, resolveZoneId } from '../lib/cloudflare.mjs';
import {
  buildUrls,
  collectDistUrls,
  expandUrlVariants,
  resolveBatchSize,
  resolveDistRoot,
  toPrefix
} from '../lib/urls.mjs';

const HOST_BATCH_SIZE = 30;

function boolFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? 'false').toLowerCase());
}

function splitCsv(value) {
  return String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

/** Decide which URLs a purge covers: explicit `--urls`, or the built site plus profile extras. */
export function planPurgeUrls({ site, flags, hosts }) {
  const explicit = splitCsv(flags.urls);
  if (explicit.length > 0) return { urls: [...new Set(explicit)], source: '--urls' };

  const distRoot = resolveDistRoot(site.projectRoot, site.profile);
  const sampled = collectDistUrls(distRoot, hosts, { includeAssets: boolFlag(flags['include-assets']) });
  const extraPaths = Array.isArray(site.profile?.cloudflare?.cachePurge?.extraPaths)
    ? site.profile.cloudflare.cachePurge.extraPaths
    : [];
  const withExtras = [...new Set([...sampled, ...buildUrls(hosts, extraPaths)])];
  const urls = boolFlag(flags['no-variants']) ? withExtras : expandUrlVariants(withExtras);
  return { urls, source: distRoot };
}

function planBody({ mode, urls, hosts }) {
  if (mode === 'everything') return { kind: 'body', body: { purge_everything: true }, count: 1, label: 'purge_everything' };
  if (mode === 'hostname') return { kind: 'list', key: 'hosts', items: hosts, label: 'hosts' };
  if (mode === 'prefix') return { kind: 'list', key: 'prefixes', items: [...new Set(urls.map(toPrefix))], label: 'prefixes' };
  if (mode === 'url') return { kind: 'list', key: 'files', items: urls, label: 'files' };
  throw new Error(`Unknown purge mode "${mode}". Use url, prefix, hostname, or everything.`);
}

export async function runPurge({ site, flags = {}, fetchImpl = globalThis.fetch, sleep, log = console.log, errorLog = console.error }) {
  const cachePurge = site.profile.cloudflare?.cachePurge || {};
  const environment = String(flags.environment || cachePurge.defaultEnvironment || 'production').toLowerCase();
  const mode = String(flags.mode || cachePurge.defaultMode || site.env.CF_CACHE_PURGE_MODE || 'url').toLowerCase();
  const apply = boolFlag(flags.apply);
  const hosts = environment === 'development' ? site.developmentHosts : site.productionHosts;
  const zoneName = site.profile.zone.name;
  const batchSize = mode === 'hostname'
    ? HOST_BATCH_SIZE
    : resolveBatchSize({ flags, profile: site.profile, env: site.env });

  const urls = mode === 'url' || mode === 'prefix' ? planPurgeUrls({ site, flags, hosts }) : { urls: [], source: '' };
  const plan = planBody({ mode, urls: urls.urls, hosts });
  const itemCount = plan.kind === 'list' ? plan.items.length : plan.count;
  const batchCount = plan.kind === 'list' ? Math.ceil(itemCount / batchSize) : 1;

  log('\ncache-purge');
  log(`- Profile: ${site.profile.siteId}`);
  log(`- Project root: ${site.projectRoot}`);
  log(`- Environment: ${environment}`);
  log(`- Zone: ${zoneName}`);
  log(`- Mode: ${mode}`);
  log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);
  if (urls.source) log(`- URL source: ${urls.source}`);
  log(`- ${plan.label}: ${itemCount} in ${batchCount} request(s) of up to ${plan.kind === 'list' ? batchSize : 1}`);

  if (itemCount === 0) {
    errorLog('\n[cache-purge] Nothing to purge. Run the build first so dist/ exists, or pass --urls.');
    return 1;
  }

  if (mode === 'prefix' && plan.items.some((item) => hosts.includes(item))) {
    log('[warn] A bare-host prefix purges every cached URL on that host.');
  }

  if (!apply) {
    if (plan.kind === 'list') for (const item of plan.items) log(`  - ${item}`);
    log('\nDry-run only. Re-run with --apply to submit.');
    return 0;
  }

  const token = String(site.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!token) {
    throw new Error('Missing CLOUDFLARE_API_TOKEN in the project root .env, Web_Toolkit/.env, or shell env.');
  }

  const zoneId = await resolveZoneId({ token, zoneName, fetchImpl });
  try {
    const common = { token, zoneId, fetchImpl, sleep, log };
    const result = plan.kind === 'list'
      ? await purgeInBatches({ ...common, key: plan.key, items: plan.items, batchSize })
      : await purgeBody({ ...common, body: plan.body });
    log(`- Purge submitted for zone ${zoneName} (${zoneId}): ${result.submitted} ${plan.label} in ${result.batches} request(s)`);
    return 0;
  } catch (error) {
    if (error instanceof CloudflarePurgeError) {
      errorLog(`\n[cache-purge] ${error.message}`);
      errorLog(`- Already purged: ${error.submitted}; not purged: ${error.remaining}. Fix the cause and re-run (purges are idempotent).`);
      return 1;
    }
    throw error;
  }
}
