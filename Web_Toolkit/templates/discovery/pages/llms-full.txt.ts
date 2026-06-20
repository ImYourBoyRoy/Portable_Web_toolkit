/// <reference types="vite/client" />
// ./src/pages/llms-full.txt.ts
/**
 * Expanded AI-readable site brief built from public routes and page metadata.
 */

import type { APIRoute } from 'astro';
import { extractMetadataFromContent } from '../lib/metadata-extractor';

export const GET: APIRoute = async ({ site }) => {
  const pages = import.meta.glob('./**/*.{astro,md,mdx}', {
    query: '?raw',
    import: 'default',
    eager: true
  }) as Record<string, string>;

  const sections = Object.entries(pages)
    .filter(([key]) => {
      const isPublic = !key.includes('/admin/') && !key.includes('/api/');
      const isInternal = ['robots.txt.ts', 'sitemap.xml.ts', 'llms.txt.ts', 'llms-full.txt.ts']
        .some((name) => key.endsWith(name));
      return isPublic && !isInternal;
    })
    .map(([key, content]) => {
      const metadata = extractMetadataFromContent(content, key);
      return [
        `### ${metadata.title}`,
        `- Description: ${metadata.description}`,
        `- Headings: ${metadata.headings.join(', ') || 'None detected'}`,
        `- Links: ${metadata.links.slice(0, 12).join(', ') || 'None detected'}`
      ].join('\n');
    })
    .join('\n\n');

  const baseUrl = site?.toString().replace(/\/$/, '') || 'https://example.com';
  const body = [
    `# ${site?.hostname || 'example.com'} — Full Context`,
    '',
    '## Pages',
    sections,
    '',
    '## Discovery Endpoints',
    `- Base URL: ${baseUrl}`,
    `- Sitemap: ${new URL('/sitemap.xml', `${baseUrl}/`).href}`,
    `- Robots: ${new URL('/robots.txt', `${baseUrl}/`).href}`
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
  });
};
