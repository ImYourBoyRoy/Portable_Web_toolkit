// ./src/pages/.well-known/security.txt.ts
/** RFC 9116 security contact — production hosts only. Set contactEmail in site-config.ts */

import type { APIRoute } from 'astro';
import { siteConfig } from '../../lib/site-config';
import { isIndexableSite, resolveBaseUrl } from '../../lib/discovery/site';

export const prerender = true;

function securityContact(): string {
  const fromEnv = String(import.meta.env.PUBLIC_SECURITY_CONTACT || '').trim();
  if (fromEnv) return fromEnv;
  const fromConfig = String(siteConfig.contactEmail || '').trim();
  if (fromConfig) return fromConfig.startsWith('mailto:') || fromConfig.startsWith('https:')
    ? fromConfig
    : `mailto:${fromConfig}`;
  return '';
}

export const GET: APIRoute = ({ site }) => {
  const contact = securityContact();

  if (!isIndexableSite(site) || !contact) {
    return new Response('Not found\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const baseUrl = resolveBaseUrl(site);
  const body = [
    `Contact: ${contact}`,
    'Preferred-Languages: en',
    ...(baseUrl ? [`Canonical: ${new URL('/.well-known/security.txt', `${baseUrl}/`).href}`] : []),
    'Policy: Report security issues responsibly; allow reasonable time to remediate before disclosure.',
  ].join('\n');

  return new Response(`${body}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
