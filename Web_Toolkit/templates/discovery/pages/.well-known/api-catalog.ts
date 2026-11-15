// ./src/pages/.well-known/api-catalog.ts
/**
 * RFC 9727 API catalog at /.well-known/api-catalog: a linkset (RFC 9264) listing each public API.
 * APIs come from siteConfig.apis plus the built-in content index and search API. Prerendered. The deployed
 * Content-Type (application/linkset+json; profile=...rfc9727) is set in _headers by scripts/discovery-postbuild.mjs.
 */

import type { APIRoute } from 'astro';
import { canonicalUrl, resolveBaseUrl } from '../../lib/discovery/site';
import { siteConfig } from '../../lib/site-config';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const baseUrl = resolveBaseUrl(site);
  const abs = (path: string) => canonicalUrl(baseUrl, path);
  const desc = siteConfig.openapiPath
    ? [{ href: abs(siteConfig.openapiPath), type: 'application/json' }]
    : undefined;
  const doc = [{ href: abs('/llms-full.txt'), type: 'text/plain' }];

  const apis = [
    { path: '/api/content.json' },
    { path: '/api/search.json' },
    ...siteConfig.apis,
  ].filter((api, index, all) => all.findIndex((other) => other.path === api.path) === index);

  const linkset = [
    {
      anchor: abs('/.well-known/api-catalog'),
      item: apis.map((api) => ({ href: abs(api.path) })),
      profile: [{ href: 'https://www.rfc-editor.org/info/rfc9727' }],
    },
    ...apis.map((api) => ({
      anchor: abs(api.path),
      ...(desc ? { 'service-desc': desc } : {}),
      'service-doc': doc,
    })),
  ];

  return new Response(JSON.stringify({ linkset }, null, 2), {
    headers: {
      'Content-Type': 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
