/// <reference types="vite/client" />
// ./src/pages/sitemap.xml.ts
/**
 * Static route sitemap for Astro sites. Extend with collections or live data as needed.
 */

import type { APIRoute } from 'astro';
import { extractMetadataFromContent } from '../lib/metadata-extractor';
import { canonicalPagePath } from '../lib/discovery/site';
import { getPublicPageRoutes } from '../lib/discovery/routes';

export const prerender = true;

function escapeXml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export const GET: APIRoute = async ({ site }) => {
  const pages = import.meta.glob('./**/*.{astro,md,mdx}', {
    query: '?raw',
    import: 'default',
    eager: true
  }) as Record<string, string>;

  if (!site) {
    return new Response('Site URL not configured in astro.config.mjs', { status: 500 });
  }
  const base = site;

  const entries = Object.entries(pages).map(([fileKey, content]) => {
    const segment = fileKey
      .replace(/^\.\//, '')
      .replace(/\.astro$/, '')
      .replace(/\.mdx?$/, '')
      .replace(/\/index$/, '')
      .replace(/^index$/, '');

    const urlPath = segment.startsWith('/') ? segment : `/${segment}`;
    const metadata = extractMetadataFromContent(content, fileKey, '');

    return {
      // Canonical form: pages end with a slash, matching <link rel="canonical"> and the URL Cloudflare serves.
      loc: new URL(canonicalPagePath(urlPath), base).href,
      path: canonicalPagePath(urlPath),
      images: metadata.images
    };
  });
  // Dates come from the shared route index (frontmatter or git-derived page-lastmod.json); unknown dates are omitted.
  const lastmodByPath = new Map(getPublicPageRoutes().map((route) => [route.path, route.lastmod]));

  const filteredEntries = entries.filter((entry) => {
    if (entry.path.includes('[') || entry.path.includes(']')) return false; // dynamic routes need getStaticPaths data
    // Compare without the trailing slash so '/404/' still matches '/404'.
    const pathname = new URL(entry.loc).pathname.replace(/\/+$/, '') || '/';
    const excluded = ['/404', '/500', '/robots.txt', '/sitemap.xml', '/llms.txt', '/llms-full.txt', '/humans.txt', '/ai.txt'];
    return !excluded.includes(pathname) && !pathname.startsWith('/admin') && !pathname.startsWith('/api/') && !pathname.startsWith('/.well-known/');
  }).sort((a, b) => a.path.localeCompare(b.path));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${filteredEntries.map((entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>${lastmodByPath.get(entry.path) ? `
    <lastmod>${escapeXml(String(lastmodByPath.get(entry.path)))}</lastmod>` : ''}
${entry.images.map((img) => `    <image:image>
      <image:loc>${escapeXml(img.src.startsWith('http') ? img.src : new URL(img.src, base).href)}</image:loc>
      <image:title>${escapeXml(img.alt)}</image:title>
    </image:image>`).join('\n')}
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
  });
};
