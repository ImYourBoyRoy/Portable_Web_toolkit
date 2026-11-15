// ./src/lib/discovery/mcp.ts
/**
 * OPTIONAL: read-only, stateless MCP server logic (Streamable HTTP, JSON responses only) for a public Astro site.
 * Tools are generic and driven by the route index and site-config: search_site, list_pages, read_page, read_site,
 * get_site_info. Add site-specific tools (services and pricing, catalog, contact path) to TOOLS below, keeping each
 * one read-only, bounded and free of secrets. Never expose user-scoped data here.
 * Speaks both protocol eras: 2026-07-28 (`server/discover`) and the 2025 handshake (`initialize`), answering each
 * request on its own. The route (src/pages/api/mcp.ts) owns HTTP concerns; this module is pure JSON-RPC.
 */
import { getPublicPageRoutes, searchRoutes } from './routes';
import { canonicalUrl } from './site';
import { siteConfig } from '../site-config';

export const MCP_SERVER_INFO = {
  name: 'site-readonly',
  title: `${siteConfig.name} (read-only)`,
  version: '1.0.0',
};
export const MCP_SUPPORTED_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'];
export const MCP_MAX_BODY_BYTES = 16 * 1024;
const MAX_QUERY_LENGTH = 120;
const MAX_READ_CHARS = 250_000;

export const MCP_INSTRUCTIONS =
  `Read-only access to the public pages of ${siteConfig.name}. Nothing here changes state. ` +
  'Use read_site to read every page in one call, or search_site and read_page for a single topic.';

export interface McpContext {
  /** Fetches a Markdown file from static assets (for example `/about/index.md` or `/site.md`). */
  readMarkdown?: (path: string) => Promise<string | null>;
  /** Public origin used to build absolute URLs, for example `https://example.com`. */
  baseUrl: string;
}

interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean | string>;
  run: (args: Record<string, unknown>, context: McpContext) => Promise<unknown> | unknown;
}

class ToolInputError extends Error {}
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const emptySchema = { type: 'object', properties: {}, additionalProperties: false };

const text = (args: Record<string, unknown>, key: string, { required = false, max = 200 } = {}): string => {
  const value = args[key];
  if (value === undefined || value === null || value === '') {
    if (required) throw new ToolInputError(`"${key}" is required.`);
    return '';
  }
  if (typeof value !== 'string') throw new ToolInputError(`"${key}" must be a string.`);
  if (value.length > max) throw new ToolInputError(`"${key}" must be at most ${max} characters.`);
  return value.trim();
};

const TOOLS: ToolDefinition[] = [
  {
    name: 'search_site',
    title: 'Search the site',
    description: `Search the public pages of ${siteConfig.name} by keyword. Returns titles, descriptions and URLs (including Markdown versions).`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: MAX_QUERY_LENGTH },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: readOnly,
    run: (args, { baseUrl }) => {
      const query = text(args, 'query', { required: true, max: MAX_QUERY_LENGTH });
      const limit = typeof args.limit === 'number' ? Math.min(Math.max(Math.trunc(args.limit), 1), 10) : 5;
      const results = searchRoutes(query).slice(0, limit).map((route) => ({
        title: route.title,
        description: route.description,
        url: canonicalUrl(baseUrl, route.path),
        ...(route.markdownPath ? { markdownUrl: canonicalUrl(baseUrl, route.markdownPath) } : {}),
      }));
      return { query, count: results.length, results };
    },
  },
  {
    name: 'list_pages',
    title: 'List pages',
    description: 'List every public page with title, description, URL, Markdown URL and last-modified date.',
    inputSchema: emptySchema,
    annotations: readOnly,
    run: (_args, { baseUrl }) => ({
      pages: getPublicPageRoutes().map((route) => ({
        path: route.path,
        title: route.title,
        description: route.description,
        url: canonicalUrl(baseUrl, route.path),
        ...(route.markdownPath ? { markdownUrl: canonicalUrl(baseUrl, route.markdownPath) } : {}),
        lastModified: route.lastmod,
      })),
    }),
  },
  {
    name: 'read_page',
    title: 'Read a page as Markdown',
    description: 'Return the Markdown version of one public page. Use a path from list_pages, for example "/about/".',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', maxLength: 120 } },
      required: ['path'],
      additionalProperties: false,
    },
    annotations: readOnly,
    run: async (args, context) => {
      const path = text(args, 'path', { required: true, max: 120 });
      const wanted = new URL(canonicalUrl('https://x.invalid', path.replace(/index\.md$/, ''))).pathname;
      const route = getPublicPageRoutes().find((entry) => entry.path === wanted);
      if (!route) throw new ToolInputError(`No public page at "${path}". Known paths: ${getPublicPageRoutes().map((entry) => entry.path).join(', ')}`);
      const markdown = route.markdownPath ? await context.readMarkdown?.(route.markdownPath) : null;
      if (!markdown) throw new ToolInputError(`The Markdown version of ${route.path} is not available (server-rendered pages have no Markdown version). Open ${canonicalUrl(context.baseUrl, route.path)} instead.`);
      return { url: canonicalUrl(context.baseUrl, route.path), lastModified: route.lastmod, markdown: markdown.slice(0, MAX_READ_CHARS) };
    },
  },
  {
    name: 'read_site',
    title: 'Read the whole site',
    description: 'Return every public page as one Markdown document. Use this instead of many read_page calls to get the full picture.',
    inputSchema: emptySchema,
    annotations: readOnly,
    run: async (_args, context) => {
      const markdown = await context.readMarkdown?.('/site.md');
      if (!markdown) throw new ToolInputError(`The site bundle is not available in this runtime. Fetch ${canonicalUrl(context.baseUrl, '/site.md')} instead.`);
      return { url: canonicalUrl(context.baseUrl, '/site.md'), bytes: markdown.length, markdown: markdown.slice(0, MAX_READ_CHARS) };
    },
  },
  {
    name: 'get_site_info',
    title: 'Get site information',
    description: 'Name, summary and links for this site.',
    inputSchema: emptySchema,
    annotations: readOnly,
    run: (_args, { baseUrl }) => ({
      name: siteConfig.name,
      description: siteConfig.description,
      website: baseUrl,
      links: siteConfig.sameAs,
      llms: canonicalUrl(baseUrl, '/llms.txt'),
      sitemap: canonicalUrl(baseUrl, '/sitemap.xml'),
    }),
  },
];

export const mcpToolList = () => TOOLS.map(({ run: _run, ...definition }) => definition);

const CACHE_HINT = { ttlMs: 3_600_000, cacheScope: 'public' };

type RpcId = string | number | null;
export interface RpcRequest { jsonrpc?: string; id?: RpcId; method?: string; params?: Record<string, unknown> }
export interface RpcResponse { jsonrpc: '2.0'; id: RpcId; result?: unknown; error?: { code: number; message: string } }

const ok = (id: RpcId, result: unknown): RpcResponse => ({ jsonrpc: '2.0', id, result });
const fail = (id: RpcId, code: number, message: string): RpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });
const negotiate = (requested: unknown): string =>
  typeof requested === 'string' && MCP_SUPPORTED_VERSIONS.includes(requested) ? requested : MCP_SUPPORTED_VERSIONS[1]!;

/** Handles one JSON-RPC message. Returns null for notifications (HTTP 202, no body). */
export async function handleRpc(message: RpcRequest, context: McpContext): Promise<RpcResponse | null> {
  const id = message.id ?? null;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') return message.id === undefined ? null : fail(id, -32600, 'Invalid JSON-RPC request.');
  if (message.id === undefined) return null;

  switch (message.method) {
    case 'initialize':
      return ok(id, { protocolVersion: negotiate(message.params?.protocolVersion), capabilities: { tools: { listChanged: false } }, serverInfo: MCP_SERVER_INFO, instructions: MCP_INSTRUCTIONS });
    case 'server/discover':
      return ok(id, { supportedVersions: MCP_SUPPORTED_VERSIONS, capabilities: { tools: { listChanged: false } }, serverInfo: MCP_SERVER_INFO, instructions: MCP_INSTRUCTIONS, ...CACHE_HINT });
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: mcpToolList(), ...CACHE_HINT });
    case 'tools/call': {
      const name = message.params?.name;
      const tool = TOOLS.find((entry) => entry.name === name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${String(name).slice(0, 80)}`);
      const args = message.params?.arguments;
      if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) return fail(id, -32602, 'arguments must be an object.');
      try {
        const data = await tool.run((args as Record<string, unknown>) ?? {}, context);
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false });
      } catch (error) {
        return ok(id, { content: [{ type: 'text', text: error instanceof ToolInputError ? error.message : 'The tool failed. Try again later.' }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${message.method.slice(0, 80)}`);
  }
}

/** Static server card served at /.well-known/mcp/server-card.json. */
export const buildServerCard = (baseUrl: string) => ({
  name: MCP_SERVER_INFO.name,
  version: MCP_SERVER_INFO.version,
  title: MCP_SERVER_INFO.title,
  description: `Read-only MCP server for ${siteConfig.name}: site search, page list, per-page Markdown and the whole site in one call.`,
  websiteUrl: baseUrl,
  remotes: [{ type: 'streamable-http', url: canonicalUrl(baseUrl, '/api/mcp') }],
  protocolVersions: MCP_SUPPORTED_VERSIONS,
  authentication: { required: false },
  capabilities: { tools: { listChanged: false } },
  tools: mcpToolList().map(({ name, title, description }) => ({ name, title, description })),
  policy: 'Read-only. No accounts, no secrets, no writes. Responses are public data from the website.',
});
