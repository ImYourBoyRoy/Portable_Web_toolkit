// ./src/lib/discovery/site.ts
/** Environment-aware indexing rules for discovery artifacts. */

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
