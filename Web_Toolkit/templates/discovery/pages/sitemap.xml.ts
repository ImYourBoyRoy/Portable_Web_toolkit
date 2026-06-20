/// <reference types="vite/client" />
// ./src/pages/sitemap.xml.ts
/**
 * Static route sitemap for Astro sites. Extend with collections or live data as needed.
 */

import type { APIRoute } from 'astro';
import { extractMetadataFromContent } from '../lib/metadata-extractor';

export const GET: APIRoute = async ({ site }) => {
  const pages = import.meta.glob('./**/*.{astro,md,mdx}', {
    query: '?raw',
    import: 'default',
    eager: true
  }) as Record<string, string>;

  const buildDate = new Date().toISOString().split('T')[0];
  const base = site ?? new URL('https://example.com');

  const entries = Object.entries(pages).map(([fileKey, content]) => {
    const segment = fileKey
      .replace(/^\.\//, '')
      .replace(/\.astro$/, '')
      .replace(/\.mdx?$/, '')
      .replace(/\/index$/, '')
      .replace(/^index$/, '');

    const urlPath = segment.startsWith('/') ? segment : `/${segment}`;
    const metadata = extractMetadataFromContent(content, fileKey, buildDate);

    return {
      loc: new URL(urlPath === '/' ? '' : urlPath, base).href,
      lastmod: metadata.lastmod,
      priority: urlPath === '/' ? '1.0' : '0.8',
      changefreq: 'monthly',
      images: metadata.images
    };
  });

  const filteredEntries = entries.filter((entry) => {
    const pathname = new URL(entry.loc).pathname;
    const excluded = ['/404', '/robots.txt', '/sitemap.xml', '/llms.txt', '/llms-full.txt'];
    return !excluded.includes(pathname) && !pathname.startsWith('/admin') && !pathname.startsWith('/api/');
  }).sort((a, b) => b.priority.localeCompare(a.priority));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${filteredEntries.map((entry) => `  <url>
    <loc>${entry.loc}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
${entry.images.map((img) => `    <image:image>
      <image:loc>${img.src.startsWith('http') ? img.src : new URL(img.src, base).href}</image:loc>
      <image:title>${img.alt}</image:title>
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
