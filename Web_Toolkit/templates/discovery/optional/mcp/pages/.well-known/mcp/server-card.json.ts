// ./src/pages/.well-known/mcp/server-card.json.ts
/** OPTIONAL MCP server card for /api/mcp, served at /.well-known/mcp/server-card.json. Prerendered. */

import type { APIRoute } from 'astro';
import { buildServerCard } from '../../../lib/discovery/mcp';
import { resolveBaseUrl } from '../../../lib/discovery/site';

export const prerender = true;

export const GET: APIRoute = ({ site }) =>
  new Response(JSON.stringify(buildServerCard(resolveBaseUrl(site)), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  });
