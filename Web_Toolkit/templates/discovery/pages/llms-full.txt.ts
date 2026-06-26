/// <reference types="vite/client" />
// ./src/pages/llms-full.txt.ts
/** Expanded AI-readable brief from site-config and page metadata. */

import type { APIRoute } from 'astro';
import { getPublicPageRoutes } from '../lib/discovery/routes';
import { resolveBaseUrl } from '../lib/discovery/site';
import { siteConfig } from '../lib/site-config';
import { extractMetadataFromContent } from '../lib/metadata-extractor';

export const prerender = true;

const pageModules = import.meta.glob('./**/*.{astro,md,mdx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const GET: APIRoute = ({ site }) => {
  const buildDate = new Date().toISOString().split('T')[0];
  const routes = getPublicPageRoutes(buildDate);
  const baseUrl = resolveBaseUrl(site);

  const sections = Object.entries(pageModules)
    .filter(([key]) => !key.includes('/admin/') && !key.includes('/api/'))
    .filter(([key]) => !['robots.txt.ts', 'sitemap.xml.ts', 'llms.txt.ts', 'llms-full.txt.ts', 'humans.txt.ts']
      .some((name) => key.endsWith(name)))
    .map(([key, content]) => {
      const metadata = extractMetadataFromContent(content, key, buildDate);
      return [
        `### ${metadata.title}`,
        `- Description: ${metadata.description}`,
        `- Headings: ${metadata.headings.join(', ') || 'None detected'}`,
      ].join('\n');
    })
    .join('\n\n');

  const body = [
    `# ${siteConfig.name} — Full Context`,
    siteConfig.description,
    '',
    '## Pages',
    sections || routes.map((r) => `- ${r.title}: ${r.description}`).join('\n'),
    '',
    ...(baseUrl
      ? [
          '## Discovery Endpoints',
          `- Base URL: ${baseUrl}`,
          `- Sitemap: ${new URL('/sitemap.xml', `${baseUrl}/`).href}`,
          `- Content API: ${new URL('/api/content.json', `${baseUrl}/`).href}`,
          `- Search API: ${new URL('/api/search.json?q=', `${baseUrl}/`).href}`,
        ]
      : []),
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
};
