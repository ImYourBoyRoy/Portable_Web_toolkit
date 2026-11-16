// ./Web_Toolkit/preview_check/src/commands/seo.mjs
/**
 * `preview-check seo`: deterministic on-page SEO audit of a preview or live site.
 *
 * Renders each route (so client-injected tags are seen), extracts title/description/canonical/robots/lang/h1/OG/Twitter/
 * JSON-LD/hreflang/image sizing, checks internal links (HEAD, redirects not followed), and prints one line per CAUSE.
 * Complements discovery-doctor (sitemap/robots/llms/headers) and WCAGate (accessibility); it does not do keyword or
 * content-strategy work, which needs Search Console data.
 * Exit codes: 0 no errors; 2 errors found; 1 failure.
 */

import { routesFromSitemap } from '../../../shared/lib/sitemap.mjs';
import { parseRoutes, resolveBase, withBrowser } from '../lib/browser.mjs';
import { analyzeLinks, analyzePages, renderIssues } from '../lib/seo-rules.mjs';

/** Runs in the page. */
function collectPage() {
  const meta = (selector) => document.querySelector(selector)?.getAttribute('content')?.trim() ?? '';
  const og = {};
  for (const node of document.querySelectorAll('meta[property^="og:"]')) og[node.getAttribute('property')] = node.getAttribute('content')?.trim() ?? '';
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => {
    try { const data = JSON.parse(node.textContent); return { ok: true, type: Array.isArray(data) ? data[0]?.['@type'] : data['@type'] }; } catch { return { ok: false }; }
  });
  const images = [...document.querySelectorAll('img')];
  return {
    title: document.title.trim(),
    description: meta('meta[name="description"]'),
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() ?? '',
    robots: meta('meta[name="robots"]'),
    lang: document.documentElement.getAttribute('lang') ?? '',
    h1: document.querySelectorAll('h1').length,
    og,
    twitterCard: meta('meta[name="twitter:card"]'),
    jsonLd,
    hreflang: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((node) => node.getAttribute('href') ?? ''),
    images: { total: images.length, unsized: images.filter((img) => !(img.getAttribute('width') && img.getAttribute('height')) && !img.closest('picture, svg')).length },
    links: [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((href) => href && !/^(mailto:|tel:|javascript:|#)/.test(href)))]
  };
}

export async function runSeo(flags = {}) {
  const projectRoot = flags['project-root'] ? String(flags['project-root']) : process.cwd();
  const base = resolveBase(flags);
  const origin = new URL(base).origin;
  let routes = parseRoutes(flags.routes);
  if (flags.sitemap) {
    const found = await routesFromSitemap({ baseUrl: base, source: typeof flags.sitemap === 'string' ? flags.sitemap : undefined, limit: Number(flags['max-routes'] || 60) });
    routes = found.routes;
    process.stderr.write(`sitemap ${found.source}: ${routes.length} route(s)${found.truncated ? ' (truncated; raise --max-routes)' : ''}\n`);
  }

  const pages = [];
  const linkSources = new Map();
  await withBrowser(projectRoot, async (browser) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    for (const route of routes) {
      const response = await page.goto(`${base}${route}`, { waitUntil: 'load' });
      if (response && response.status() >= 400) { pages.push({ route, status: response.status() }); continue; }
      await page.waitForTimeout(Number(flags['settle-ms'] || 300));
      const data = await page.evaluate(collectPage);
      pages.push({ route, ...data });
      for (const href of data.links) {
        let target;
        try { target = new URL(href, `${base}${route}`); } catch { continue; }
        if (target.origin !== origin) continue;
        const key = `${target.pathname}${target.search}`;
        linkSources.set(key, [...(linkSources.get(key) ?? []), route]);
      }
    }
    await context.close();
  });

  const unreachable = pages.filter((entry) => entry.status);
  const issues = analyzePages(pages.filter((entry) => !entry.status), { canonicalHost: flags['canonical-host'] ? String(flags['canonical-host']) : undefined, expectIndexable: flags['allow-noindex'] !== true });
  for (const entry of unreachable) issues.unshift({ id: 'route-status', severity: 'error', message: `route returned HTTP ${entry.status}`, pages: [{ route: entry.route }] });

  if (flags['skip-links'] !== true) {
    const targets = [...linkSources.entries()].slice(0, Number(flags['max-links'] || 300));
    const checked = [];
    for (const [target, from] of targets) {
      let status = 0;
      let location;
      try {
        const response = await fetch(`${origin}${target}`, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15_000) });
        status = response.status;
        location = response.headers.get('location') ?? undefined;
        if (status === 405 || status === 501) { const get = await fetch(`${origin}${target}`, { redirect: 'manual', signal: AbortSignal.timeout(15_000) }); status = get.status; location = get.headers.get('location') ?? location; }
      } catch { status = 0; }
      checked.push({ target, status, location, from: [...new Set(from)] });
    }
    issues.push(...analyzeLinks(checked));
  }

  process.stdout.write(renderIssues(issues, { total: pages.length }));
  return issues.some((issue) => issue.severity === 'error') ? 2 : 0;
}
