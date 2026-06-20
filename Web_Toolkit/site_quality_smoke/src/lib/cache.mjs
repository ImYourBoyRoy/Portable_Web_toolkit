// ./Web_Toolkit/site_quality_smoke/src/lib/cache.mjs
/**
 * Cache-header heuristics for site-quality-smoke.
 */

function parseMaxAge(cacheControl = '') {
  const match = String(cacheControl || '').match(/max-age=(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function pathnameFromUrl(url = '') {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function isVersionedStaticAsset(url = '') {
  const pathname = pathnameFromUrl(url);
  return pathname.startsWith('/_astro/') || /[.-][a-f0-9]{8,}\./i.test(pathname);
}

export function hasStrongStaticAssetCache(cacheControl = '') {
  const value = String(cacheControl || '').toLowerCase();
  const maxAge = parseMaxAge(value);
  return maxAge >= 31536000 && value.includes('immutable');
}

