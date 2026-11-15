// ./src/middleware.ts
/**
 * Production security headers, dev/staging noindex, per-IP API rate limiting and agent-discovery headers.
 * Adjust CSP if you add third-party scripts. Prerendered pages never reach middleware: src/worker.ts negotiates
 * `Accept: text/markdown` for them and scripts/discovery-postbuild.mjs writes their Link headers into _headers.
 */

import type { MiddlewareHandler } from 'astro';
import { env } from 'cloudflare:workers';
import { negotiateMarkdown, prefersMarkdown } from './lib/discovery/negotiate';
import { checkRateLimit } from './lib/discovery/ratelimit';
import { isIndexableHost } from './lib/discovery/site';

const API_LINK_HEADER = '</.well-known/api-catalog>; rel="api-catalog"';
type Bindings = {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  API_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
};

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "connect-src 'self' https://static.cloudflareinsights.com",
  'upgrade-insecure-requests',
].join('; ');

export const onRequest: MiddlewareHandler = async (context, next) => {
  const bindings = env as Bindings;
  const limited = await checkRateLimit(context.request, context.url.pathname, bindings.API_RATE_LIMIT);
  if (limited) return limited;

  const response = await next();

  // Markdown for agents: SSR HTML pages that have a twin answer Accept: text/markdown with it.
  if (response.status === 200 && response.headers.get('content-type')?.includes('text/html') && prefersMarkdown(context.request.headers.get('accept'))) {
    const markdown = await negotiateMarkdown(context.request, bindings.ASSETS);
    if (markdown) return markdown;
  }

  const host = context.url.hostname.toLowerCase();
  const newResponse = new Response(response.body, response);
  const isHtml = newResponse.headers.get('content-type')?.includes('text/html');

  if (isHtml) {
    newResponse.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    newResponse.headers.set('X-Content-Type-Options', 'nosniff');
    newResponse.headers.set('X-Frame-Options', 'DENY');
    newResponse.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    newResponse.headers.set('Strict-Transport-Security', 'max-age=31536000');
    newResponse.headers.append('Vary', 'Accept');
  }

  if (context.url.pathname.startsWith('/api/') && newResponse.headers.get('content-type')?.includes('json') && !newResponse.headers.has('link')) {
    newResponse.headers.set('Link', API_LINK_HEADER);
  }

  if (!isIndexableHost(host)) {
    newResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  return newResponse;
};
