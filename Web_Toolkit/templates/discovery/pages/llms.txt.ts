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

function discoveryUrl(baseUrl: string, href: string): string {
  if (!baseUrl) return href;
  return new URL(href, `${baseUrl}/`).href;
}

export const GET: APIRoute = ({ site }) => {
  const buildDate = new Date().toISOString().split('T')[0];
  const routes = getPublicPageRoutes(buildDate);
  const baseUrl = resolveBaseUrl(site);
  const optionalDiscovery = (siteConfig as typeof siteConfig & {
    publicDiscovery?: Array<{ label: string; path: string; description?: string }>;
  }).publicDiscovery;
  const configuredDiscovery = Array.isArray(optionalDiscovery) ? optionalDiscovery : [];

  const body = [
    `# ${siteConfig.name}`,
    `> ${siteConfig.description}`,
    '',
    '## Routes',
    ...routes.map((route) =>
      `- [${route.title}](${baseUrl ? pageUrl(baseUrl, route.path) : route.path}): ${route.description}`,
    ),
    '',
    '## Discovery',
    `- [Sitemap](${discoveryUrl(baseUrl, '/sitemap.xml')}): Public URL index.`,
    `- [Full context](${discoveryUrl(baseUrl, '/llms-full.txt')}): Expanded public context.`,
    `- [Content API](${discoveryUrl(baseUrl, '/api/content.json')}): Public route structure only.`,
    ...configuredDiscovery.map((entry) => `- [${entry.label}](${discoveryUrl(baseUrl, entry.path)}): ${entry.description || 'Public discovery endpoint.'}`),
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
};
