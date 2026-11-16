// ./Web_Toolkit/preview_check/src/lib/seo-rules.mjs
/**
 * Pure on-page SEO rules over data extracted from rendered pages (no browser, no network), so they are testable and
 * their output is grouped by issue (one line per cause with the pages it affects) instead of one line per page.
 *
 * Only deterministic, objectively checkable things are here. Keyword research, content strategy, and ranking
 * advice need external data (Search Console) and are intentionally out of scope.
 */

const LIMITS = { titleMin: 15, titleMax: 65, descMin: 50, descMax: 160 };

/** @typedef {{ route: string, title: string, description: string, canonical: string, robots: string, lang: string, h1: number, og: Record<string,string>, twitterCard: string, jsonLd: Array<{ ok: boolean, type?: string }>, hreflang: string[], images: { total: number, unsized: number } }} PageData */

function add(issues, id, severity, message, route, detail) {
  const key = `${id}|${message}`;
  const entry = issues.get(key) ?? { id, severity, message, pages: [] };
  entry.pages.push(detail ? { route, detail } : { route });
  issues.set(key, entry);
}

/** @param {PageData[]} pages @param {{ origin?: string, expectIndexable?: boolean, canonicalHost?: string }} [options] */
export function analyzePages(pages, options = {}) {
  const issues = new Map();
  const titles = new Map();
  const descriptions = new Map();
  for (const page of pages) {
    const { route } = page;
    if (!page.title) add(issues, 'title-missing', 'error', 'missing <title>', route);
    else {
      if (page.title.length < LIMITS.titleMin || page.title.length > LIMITS.titleMax) add(issues, 'title-length', 'warn', `title length outside ${LIMITS.titleMin}-${LIMITS.titleMax} characters`, route, `${page.title.length}`);
      titles.set(page.title, [...(titles.get(page.title) ?? []), route]);
    }
    if (!page.description) add(issues, 'description-missing', 'error', 'missing meta description', route);
    else {
      if (page.description.length < LIMITS.descMin || page.description.length > LIMITS.descMax) add(issues, 'description-length', 'warn', `meta description length outside ${LIMITS.descMin}-${LIMITS.descMax} characters`, route, `${page.description.length}`);
      descriptions.set(page.description, [...(descriptions.get(page.description) ?? []), route]);
    }
    if (!page.canonical) add(issues, 'canonical-missing', 'error', 'missing <link rel="canonical">', route);
    else {
      let url = null;
      try { url = new URL(page.canonical); } catch { add(issues, 'canonical-relative', 'error', 'canonical is not an absolute URL', route, page.canonical); }
      if (url) {
        if (options.canonicalHost && url.host !== options.canonicalHost) add(issues, 'canonical-host', 'error', `canonical host is not ${options.canonicalHost}`, route, url.host);
        const wantSlash = route !== '/' && route.endsWith('/');
        const hasSlash = url.pathname !== '/' && url.pathname.endsWith('/');
        if (route !== '/' && wantSlash !== hasSlash) add(issues, 'canonical-slash', 'warn', 'canonical trailing slash differs from the served route', route, url.pathname);
        else if (url.pathname.replace(/\/$/, '') !== route.replace(/\/$/, '').split('?')[0]) add(issues, 'canonical-other-page', 'warn', 'canonical points at a different path (intentional only for duplicates)', route, url.pathname);
      }
    }
    if (/noindex/i.test(page.robots) && options.expectIndexable !== false) add(issues, 'noindex', 'error', 'page is noindex', route, page.robots);
    if (!page.lang) add(issues, 'lang-missing', 'error', '<html lang> missing', route);
    if (page.h1 === 0) add(issues, 'h1-missing', 'error', 'no <h1>', route);
    else if (page.h1 > 1) add(issues, 'h1-multiple', 'warn', 'more than one <h1>', route, `${page.h1}`);
    for (const key of ['og:title', 'og:description', 'og:image', 'og:url']) if (!page.og?.[key]) add(issues, `og-${key.slice(3)}-missing`, 'warn', `missing ${key}`, route);
    if (page.og?.['og:image'] && !/^https?:\/\//.test(page.og['og:image'])) add(issues, 'og-image-relative', 'error', 'og:image is not an absolute URL (social platforms will not fetch it)', route, page.og['og:image']);
    if (!page.twitterCard) add(issues, 'twitter-card-missing', 'warn', 'missing twitter:card', route);
    for (const block of page.jsonLd ?? []) if (!block.ok) add(issues, 'jsonld-invalid', 'error', 'JSON-LD does not parse', route);
    if (page.images?.unsized > 0) add(issues, 'img-unsized', 'warn', 'images without width/height (layout shift)', route, `${page.images.unsized}/${page.images.total}`);
    if (page.hreflang?.length > 0 && page.canonical && !page.hreflang.includes(page.canonical)) add(issues, 'hreflang-self', 'warn', 'hreflang set lacks a self-reference to the canonical URL', route);
  }
  for (const [title, routes] of titles) if (routes.length > 1) add(issues, 'title-duplicate', 'error', `duplicate title "${title.slice(0, 50)}"`, routes.join(' '));
  for (const [description, routes] of descriptions) if (routes.length > 1) add(issues, 'description-duplicate', 'warn', `duplicate meta description "${description.slice(0, 50)}..."`, routes.join(' '));
  return [...issues.values()].sort((a, b) => (a.severity === b.severity ? b.pages.length - a.pages.length : a.severity === 'error' ? -1 : 1));
}

/** Broken and redirecting internal links: { target, status, from[] }. */
export function analyzeLinks(rawChecked) {
  // /contact and /contact?topic=ai are one cause: fold query variants of the same path and status together.
  const folded = new Map();
  for (const entry of rawChecked) {
    const key = `${entry.target.split('?')[0]}|${entry.status}|${entry.location ?? ''}`;
    const existing = folded.get(key) ?? { ...entry, target: entry.target.split('?')[0], from: [] };
    existing.from = [...new Set([...existing.from, ...entry.from])];
    folded.set(key, existing);
  }
  const checked = [...folded.values()];
  const issues = [];
  for (const entry of checked) {
    if (entry.status >= 400 || entry.status === 0) issues.push({ id: 'link-broken', severity: 'error', message: `broken internal link ${entry.target} (${entry.status || 'no response'})`, pages: entry.from.map((route) => ({ route })) });
    else if (entry.status >= 300) issues.push({ id: 'link-redirect', severity: 'warn', message: `internal link ${entry.target} redirects (${entry.status})${entry.location ? ` to ${entry.location}` : ''}; link the final URL`, pages: entry.from.map((route) => ({ route })) });
  }
  return issues.sort((a, b) => (a.severity === b.severity ? b.pages.length - a.pages.length : a.severity === 'error' ? -1 : 1));
}

export function renderIssues(issues, { total, maxPages = 4 } = {}) {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const lines = [`seo: ${total} page${total === 1 ? '' : 's'} | ${errors} error cause${errors === 1 ? '' : 's'}, ${issues.length - errors} warning cause${issues.length - errors === 1 ? '' : 's'}`];
  for (const issue of issues) {
    const shown = issue.pages.slice(0, maxPages).map((page) => (page.detail ? `${page.route} (${page.detail})` : page.route)).join(' ');
    const more = issue.pages.length > maxPages ? ` +${issue.pages.length - maxPages}` : '';
    lines.push(`${issue.severity === 'error' ? 'ERR ' : 'WARN'} ${issue.id}: ${issue.message} | ${issue.pages.length} page${issue.pages.length === 1 ? '' : 's'}: ${shown}${more}`);
  }
  if (issues.length === 0) lines.push('no issues');
  return `${lines.join('\n')}\n`;
}
