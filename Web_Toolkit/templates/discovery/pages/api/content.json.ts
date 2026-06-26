// ./src/pages/api/content.json.ts
/** Structured content index for agents and tools. */

import type { APIRoute } from 'astro';
import { getPublicPageRoutes } from '../../lib/discovery/routes';
import { resolveBaseUrl } from '../../lib/discovery/site';
import { siteConfig } from '../../lib/site-config';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const buildDate = new Date().toISOString().split('T')[0];
  const routes = getPublicPageRoutes(buildDate);
  const baseUrl = resolveBaseUrl(site);

  const payload = {
    generatedAt: new Date().toISOString(),
    siteName: siteConfig.name,
    siteDescription: siteConfig.description,
    ...(baseUrl ? { siteUrl: baseUrl } : {}),
    routes: routes.map((route) => ({
      ...route,
      ...(baseUrl ? { url: new URL(route.path, `${baseUrl}/`).href } : {}),
    })),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
