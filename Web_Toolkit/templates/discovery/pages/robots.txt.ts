// ./src/pages/robots.txt.ts
/** Environment-aware robots.txt for Astro + Cloudflare sites. */

import type { APIRoute } from 'astro';
import { isIndexableSite, resolveBaseUrl } from '../lib/discovery/site';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const baseUrl = resolveBaseUrl(site);
  const indexable = isIndexableSite(site);

  const body = indexable
    ? [
        'User-agent: *',
        'Allow: /',
        '',
        ...(baseUrl ? [`Sitemap: ${new URL('/sitemap.xml', `${baseUrl}/`).href}`] : []),
        ...(baseUrl ? [`# LLM summary: ${new URL('/llms.txt', `${baseUrl}/`).href}`] : []),
      ].join('\n')
    : [
        'User-agent: *',
        'Disallow: /',
        '',
        `# Preview host: ${site?.hostname ?? 'unknown'}`,
      ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      ...(indexable ? {} : { 'X-Robots-Tag': 'noindex' }),
    },
  });
};
