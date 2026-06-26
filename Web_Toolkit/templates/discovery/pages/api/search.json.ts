// ./src/pages/api/search.json.ts
/** Query-driven search over public routes (?q=). SSR for live queries on Workers. */

import type { APIRoute } from 'astro';
import { searchRoutes } from '../../lib/discovery/routes';
import { resolveBaseUrl } from '../../lib/discovery/site';

export const prerender = false;

export const GET: APIRoute = ({ site, url }) => {
  const query = url.searchParams.get('q')?.trim() ?? '';
  const buildDate = new Date().toISOString().split('T')[0];
  const baseUrl = resolveBaseUrl(site);

  if (!query) {
    return new Response(
      JSON.stringify({
        error: 'Missing query parameter "q".',
        usage: '/api/search.json?q=keyword',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const matches = searchRoutes(query, buildDate).map((route) => ({
    title: route.title,
    description: route.description,
    path: route.path,
    ...(baseUrl ? { url: new URL(route.path, `${baseUrl}/`).href } : {}),
  }));

  return new Response(
    JSON.stringify({ query, count: matches.length, results: matches }, null, 2),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
};
