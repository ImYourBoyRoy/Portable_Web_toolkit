// ./src/pages/humans.txt.ts
/** Dynamic credits and stack metadata — customize via src/lib/site-config.ts */

import type { APIRoute } from 'astro';
import packageJson from '../../package.json';
import { siteConfig } from '../lib/site-config';
import { resolveBaseUrl } from '../lib/discovery/site';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const astroVersion = String(packageJson.dependencies?.astro ?? 'unknown').replace(/^\^/, '');

  const baseUrl = resolveBaseUrl(site);
  const lines = [
    '/* SITE */',
    `Name: ${siteConfig.name}`,
    ...(siteConfig.contactEmail ? [`Contact: ${siteConfig.contactEmail}`] : []),
    '',
    '/* STACK */',
    `Framework: Astro ${astroVersion}`,
    'Hosting: Cloudflare Workers / Pages',
    `Last built: ${new Date().toISOString().split('T')[0]}`,
    ...(baseUrl ? [`Canonical: ${baseUrl}`] : []),
  ];

  if (siteConfig.credits.length > 0) {
    lines.push('', '/* THANKS */', ...siteConfig.credits.map((line) => `- ${line}`));
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
};
