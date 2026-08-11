// ./Web_Toolkit/cache_purge/src/commands/warm.mjs
/**
 * Pre-deploy cache warm: GET profile hosts + qualitySmoke routes.
 * Dry-run lists URLs; --apply performs fetches.
 */

function boolFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function normalizeRoute(route = '/') {
  const trimmed = String(route || '/').trim();
  if (!trimmed || trimmed === '/') return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function collectWarmUrls(site = {}) {
  const profile = site.profile || {};
  const productionHosts = Array.isArray(site.productionHosts) ? site.productionHosts : [];
  const developmentHosts = Array.isArray(site.developmentHosts) ? site.developmentHosts : [];
  const routes = Array.isArray(profile?.diagnostics?.qualitySmoke?.routes) && profile.diagnostics.qualitySmoke.routes.length > 0
    ? profile.diagnostics.qualitySmoke.routes
    : ['/'];

  const hosts = [...new Set([...productionHosts, ...developmentHosts].filter(Boolean))];
  const urls = [];
  for (const host of hosts) {
    for (const route of routes) {
      urls.push(`https://${host}${normalizeRoute(route)}`);
    }
  }
  return [...new Set(urls)];
}

export async function runCacheWarm({ site, flags = {} }) {
  const apply = boolFlag(flags.apply);
  const urls = collectWarmUrls(site);

  console.log('\ncache-warm');
  console.log(`- Profile: ${site.profile?.siteId || 'unknown'}`);
  console.log(`- Project root: ${site.projectRoot}`);
  console.log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);
  console.log(`- URLs prepared: ${urls.length}`);
  for (const url of urls) console.log(`  - ${url}`);

  if (!apply) return 0;
  if (urls.length === 0) {
    console.error('[cache-warm] No URLs to warm — check profile hosts and diagnostics.qualitySmoke.routes.');
    return 1;
  }

  let failures = 0;
  for (const url of urls) {
    try {
      const response = await fetch(url, { method: 'GET', redirect: 'follow' });
      console.log(`- ${url} → ${response.status}`);
      if (!response.ok) failures += 1;
    } catch (error) {
      failures += 1;
      console.error(`- ${url} → ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures > 0) {
    console.error(`\n[cache-warm] ${failures} warm request(s) failed.`);
    return 1;
  }
  console.log('\n[cache-warm] All warm requests completed successfully.');
  return 0;
}
