/// <reference types="vite/client" />
// ./src/pages/llms.txt.ts
/**
 * Concise AI-readable site summary built from public routes and page metadata.
 */

import type { APIRoute } from 'astro';
import { extractMetadataFromContent } from '../lib/metadata-extractor';

function pageUrl(site: URL | undefined, segment: string): string {
  const base = site ?? new URL('https://example.com');
  return new URL(segment === '' ? '/' : `/${segment}`, base).href;
}

export const GET: APIRoute = async ({ site }) => {
  const pages = import.meta.glob('./**/*.{astro,md,mdx}', {
    query: '?raw',
    import: 'default',
    eager: true
  }) as Record<string, string>;

  const staticPages = Object.entries(pages)
    .filter(([key]) => {
      const isPublic = !key.includes('/admin/') && !key.includes('/api/');
      const isInternal = ['robots.txt.ts', 'sitemap.xml.ts', 'llms.txt.ts', 'llms-full.txt.ts']
        .some((name) => key.endsWith(name));
      return isPublic && !isInternal;
    })
    .map(([key, content]) => {
      const metadata = extractMetadataFromContent(content, key);
      const segment = key
        .replace(/^\.\//, '')
        .replace(/\.astro$/, '')
        .replace(/\.mdx?$/, '')
        .replace(/\/index$/, '')
        .replace(/^index$/, '');
      return {
        url: pageUrl(site, segment),
        title: metadata.title,
        description: metadata.description
      };
    });

  const siteLabel = site?.hostname || 'example.com';
  const body = [
    `# ${siteLabel}`,
    'Concise route index for AI agents and tooling.',
    '',
    '## Routes',
    ...staticPages.map((page) => `- [${page.title}](${page.url}): ${page.description}`)
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
  });
};
