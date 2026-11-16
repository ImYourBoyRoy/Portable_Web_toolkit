// ./Web_Toolkit/shared/lib/sitemap.mjs
/**
 * Routes from a sitemap for tools that audit a local preview: reads <loc> entries (one level of sitemap index) and maps
 * the production host onto the audited origin, keeping only the site's own host (the one most entries use).
 */

export function extractLocs(xml) {
  return [...String(xml).matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((match) => match[1].replace(/&amp;/g, '&'));
}

export async function routesFromSitemap({ baseUrl, source, limit = 100, fetchImpl = globalThis.fetch }) {
  const origin = new URL(baseUrl).origin;
  const candidates = source ? [source] : [`${origin}/sitemap.xml`, `${origin}/sitemap-index.xml`];
  const errors = [];
  const load = async (location) => {
    const response = await fetchImpl(location, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`${location} returned HTTP ${response.status}`);
    return response.text();
  };
  const collect = async (location, depth) => {
    const xml = await load(location);
    const locs = extractLocs(xml);
    if (/<sitemapindex[\s>]/i.test(xml)) {
      if (depth >= 1) throw new Error('nested sitemap indexes are not followed');
      const pages = [];
      for (const child of locs.slice(0, 20)) pages.push(...await collect(`${origin}${new URL(child).pathname}`, depth + 1));
      return pages;
    }
    const hosts = new Map();
    for (const loc of locs) { try { const host = new URL(loc).origin; hosts.set(host, (hosts.get(host) ?? 0) + 1); } catch { /* relative */ } }
    const own = [...hosts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return locs.flatMap((loc) => {
      try { const url = new URL(loc); return url.origin === own || url.origin === origin ? [`${url.pathname}${url.search}`] : []; } catch { return loc.startsWith('/') ? [loc] : []; }
    });
  };
  for (const candidate of candidates) {
    try {
      const pages = [...new Set(await collect(candidate, 0))];
      if (pages.length === 0) throw new Error(`${candidate} lists no pages`);
      return { routes: pages.slice(0, limit), source: candidate, truncated: pages.length > limit };
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(`Could not read a sitemap for ${origin}: ${errors.join('; ')}`);
}
