// ./Web_Toolkit/site_quality_smoke/src/lib/extract.mjs
/**
 * HTML extraction helpers for quality smoke reports.
 */

export function titleFromHtml(html = '') {
  return html.match(/<title>(.*?)<\/title>/is)?.[1]?.trim() || '';
}

export function metaDescriptionFromHtml(html = '') {
  return html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1]?.trim() || '';
}

export function canonicalFromHtml(html = '') {
  return html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1]?.trim() || '';
}

export function assetUrlsFromHtml(html = '', origin = '', limit = 3) {
  const matches = [...html.matchAll(/(?:src|href)=["']([^"']+_astro\/[^"']+)["']/ig)]
    .map((match) => match[1])
    .filter(Boolean)
    .slice(0, limit);
  return [...new Set(matches.map((entry) => new URL(entry, origin).toString()))];
}

