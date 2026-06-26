// ./src/middleware.ts
/** Production security headers and dev/staging noindex — adjust CSP if you add third-party scripts. */

import type { MiddlewareHandler } from 'astro';
import { isIndexableHost } from './lib/discovery/site';

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
  const response = await next();
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
  }

  if (!isIndexableHost(host)) {
    newResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  return newResponse;
};
