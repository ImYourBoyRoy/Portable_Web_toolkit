/// <reference types="vite/client" />
// ./src/pages/llms.txt.ts
/** Concise AI-readable site summary from site-config and public routes. */

import type { APIRoute } from 'astro';
import { getPublicPageRoutes } from '../lib/discovery/routes';
import { resolveBaseUrl } from '../lib/discovery/site';
import { siteConfig } from '../lib/site-config';

export const prerender = true;

function pageUrl(baseUrl: string, routePath: string): string {
  return new URL(routePath, `${baseUrl}/`).href;
}

export const GET: APIRoute = ({ site }) => {
  const buildDate = new Date().toISOString().split('T')[0];
  const routes = getPublicPageRoutes(buildDate);
  const baseUrl = resolveBaseUrl(site);

  const body = [
    `# ${siteConfig.name}`,
    siteConfig.description,
    '',
    '## Routes',
    ...routes.map((route) =>
      baseUrl
        ? `- [${route.title}](${pageUrl(baseUrl, route.path)}): ${route.description}`
        : `- ${route.title} (${route.path}): ${route.description}`,
    ),
    '',
    ...(baseUrl
      ? [
          '## Discovery',
          `- Sitemap: ${new URL('/sitemap.xml', `${baseUrl}/`).href}`,
          `- Full context: ${new URL('/llms-full.txt', `${baseUrl}/`).href}`,
          `- Content API: ${new URL('/api/content.json', `${baseUrl}/`).href}`,
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
