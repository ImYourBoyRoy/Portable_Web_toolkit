// ./src/pages/robots.txt.ts
/** Environment-aware robots.txt for Astro + Cloudflare sites. */

import type { APIRoute } from 'astro';
import { aiPolicySummary, robotsAiGroups } from '../lib/discovery/ai-policy';
import { isIndexableSite, resolveBaseUrl } from '../lib/discovery/site';
import { siteConfig } from '../lib/site-config';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const baseUrl = resolveBaseUrl(site);
  const indexable = isIndexableSite(site);

  const body = indexable
    ? [
        `# ${aiPolicySummary()} Policy is set in src/lib/site-config.ts (aiPolicy).`,
        '# Each page also has a Markdown twin at <page>/index.md. Start at /llms.txt.',
        '',
        // Add paths no crawler needs (form handlers, download redirects) to the list below.
        ...robotsAiGroups(siteConfig.crawlerDisallow),
        ...(baseUrl ? [`Sitemap: ${new URL('/sitemap.xml', `${baseUrl}/`).href}`] : []),
        ...(baseUrl ? [`# LLM summary: ${new URL('/llms.txt', `${baseUrl}/`).href}`] : []),
        ...(baseUrl && siteConfig.apis.length ? [`# API catalog: ${new URL('/.well-known/api-catalog', `${baseUrl}/`).href}`] : []),
      ].join('\n') + '\n'
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
