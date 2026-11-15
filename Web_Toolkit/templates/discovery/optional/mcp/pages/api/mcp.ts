// ./src/pages/api/mcp.ts
/**
 * OPTIONAL read-only remote MCP endpoint (Streamable HTTP, JSON responses, stateless): POST /api/mcp
 * Protocol logic is in src/lib/discovery/mcp.ts. This route owns the HTTP edges: body size cap, JSON parsing,
 * CORS for browser-based MCP clients, 202 for notifications, 405 for GET/DELETE. Add `/api/mcp` to the rate-limited
 * paths in src/lib/discovery/ratelimit.ts (it is there by default) and declare it in siteConfig.apis.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { MCP_MAX_BODY_BYTES, handleRpc, type RpcRequest } from '../../lib/discovery/mcp';
import { canonicalUrl } from '../../lib/discovery/site';

export const prerender = false;

const baseHeaders: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

const rpcError = (status: number, code: number, message: string) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code, message } }), { status, headers: baseHeaders });

export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: baseHeaders });

const methodNotAllowed: APIRoute = ({ url }) =>
  new Response(JSON.stringify({
    error: 'This MCP server answers POST requests with JSON-RPC 2.0. It has no server-initiated stream.',
    serverCard: canonicalUrl(url.origin, '/.well-known/mcp/server-card.json'),
  }), { status: 405, headers: { ...baseHeaders, Allow: 'POST, OPTIONS' } });

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;

export const POST: APIRoute = async ({ request, url }) => {
  if (Number(request.headers.get('content-length') || 0) > MCP_MAX_BODY_BYTES) return rpcError(413, -32600, 'Request body too large (16 KB maximum).');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MCP_MAX_BODY_BYTES) return rpcError(413, -32600, 'Request body too large (16 KB maximum).');

  let message: unknown;
  try { message = JSON.parse(raw); } catch { return rpcError(400, -32700, 'Parse error: the body is not valid JSON.'); }
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return rpcError(400, -32600, 'Send one JSON-RPC request object per POST. Batches are not supported.');
  }

  const assets = (env as { ASSETS?: { fetch: (request: Request) => Promise<Response> } }).ASSETS;
  const response = await handleRpc(message as RpcRequest, {
    baseUrl: url.origin,
    readMarkdown: assets
      ? async (path) => {
          const result = await assets.fetch(new Request(new URL(path, url.origin)));
          return result.ok ? result.text() : null;
        }
      : undefined,
  });

  if (!response) return new Response(null, { status: 202, headers: baseHeaders });
  return new Response(JSON.stringify(response), { status: 200, headers: baseHeaders });
};
