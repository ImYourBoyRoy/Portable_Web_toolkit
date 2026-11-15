// ./src/lib/discovery/site.ts
/** Environment-aware indexing rules and canonical URL helpers for discovery artifacts. */

export function resolveBaseUrl(site: URL | undefined): string {
  if (site) return site.toString().replace(/\/$/, '');
  return '';
}

export function isIndexableHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (!lower) return false;
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) return false;
  if (lower.includes('workers.dev') || lower.includes('pages.dev')) return false;
  if (lower.startsWith('dev.') || lower.startsWith('staging.') || lower.startsWith('preview.')) {
    return false;
  }
  return true;
}

export function isIndexableSite(site: URL | undefined): boolean {
  if (!site?.hostname) return import.meta.env.PROD;
  return isIndexableHost(site.hostname);
}

/**
 * Canonical page path. Pages end with a slash (Astro prerenders `/about/index.html`, Cloudflare serves `/about/`, and
 * `<link rel="canonical">` says so); files, `/api/` and `/.well-known/` endpoints and templated paths keep their form.
 */
export function canonicalPagePath(path: string): string {
  if (!path || path === '/') return '/';
  if (/[?#{]/.test(path) || path.endsWith('/')) return path;
  if (path.startsWith('/api/') || path.startsWith('/.well-known/') || /\.[a-z0-9]+$/i.test(path)) return path;
  return `${path}/`;
}

/** Absolute canonical URL for a path on `baseUrl` (no trailing slash). */
export function canonicalUrl(baseUrl: string, path: string): string {
  return baseUrl ? new URL(canonicalPagePath(path), `${baseUrl}/`).href : canonicalPagePath(path);
}

/** `/about/` -> `/about/index.md`; `/` -> `/index.md`. */
export function markdownPathFor(path: string): string {
  const page = canonicalPagePath(path);
  return `${page.endsWith('/') ? page : `${page}/`}index.md`;
}
