// ./src/pages/ai.txt.ts
/**
 * ai.txt: the same AI usage policy as robots.txt, in the ai.txt convention some crawlers read.
 * The policy lives in siteConfig.aiPolicy. Production hosts only; previews are blocked by robots.txt.
 */

import type { APIRoute } from 'astro';
import { aiPolicySummary, contentSignal } from '../lib/discovery/ai-policy';
import { isIndexableSite } from '../lib/discovery/site';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const indexable = isIndexableSite(site);
  const body = indexable
    ? [
        '# ai.txt',
        `# ${aiPolicySummary()}`,
        `# Canonical machine-readable policy: /robots.txt (Content-Signal: ${contentSignal()}) and /llms.txt.`,
        '',
        'User-Agent: *',
        'Allow: /',
        '',
      ].join('\n')
    : 'User-Agent: *\nDisallow: /\n';

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      ...(indexable ? {} : { 'X-Robots-Tag': 'noindex' }),
    },
  });
};
