// ./src/pages/robots.txt.ts
/**
 * Environment-aware robots.txt for Astro + Cloudflare sites.
 * Uses the configured Astro `site` URL; preview builds should block indexing upstream.
 */

import type { APIRoute } from 'astro';

export const prerender = true;

function resolveBaseUrl(site: URL | undefined): string {
  if (site) return site.toString().replace(/\/$/, '');
  return 'https://example.com';
}

export const GET: APIRoute = ({ site }) => {
  const baseUrl = resolveBaseUrl(site);

  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${new URL('/sitemap.xml', `${baseUrl}/`).href}`,
    `# LLM summary: ${new URL('/llms.txt', `${baseUrl}/`).href}`
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
  });
};
