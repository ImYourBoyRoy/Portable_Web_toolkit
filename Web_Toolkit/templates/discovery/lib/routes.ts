// ./src/lib/discovery/routes.ts
/** Public route index for content.json, search.json, and llms manifests. */

import { extractMetadataFromContent } from '../metadata-extractor';

export type ContentRoute = {
  path: string;
  title: string;
  description: string;
  type: 'page' | 'policy' | 'form';
  excerpt?: string;
  lastmod: string;
};

const pageModules = import.meta.glob('../../pages/**/*.{astro,md,mdx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const INTERNAL_ROUTE_SUFFIXES = [
  'robots.txt.ts',
  'sitemap.xml.ts',
  'llms.txt.ts',
  'llms-full.txt.ts',
  'humans.txt.ts',
  'well-known/security.txt.ts',
];

function segmentFromKey(key: string): string {
  return key
    .replace(/^\.\.\/\.\.\/pages\//, '')
    .replace(/\.astro$/, '')
    .replace(/\.mdx?$/, '')
    .replace(/\/index$/, '')
    .replace(/^index$/, '');
}

function isPublicPageKey(key: string): boolean {
  if (key.includes('/admin/') || key.includes('/api/')) return false;
  if (key.includes('[') || key.includes(']')) return false;
  if (INTERNAL_ROUTE_SUFFIXES.some((name) => key.endsWith(name))) return false;
  return true;
}

export function getPublicPageRoutes(buildDate: string): ContentRoute[] {
  return Object.entries(pageModules)
    .filter(([key]) => isPublicPageKey(key))
    .map(([key, content]) => {
      const segment = segmentFromKey(key);
      const routePath = segment ? `/${segment}` : '/';
      const metadata = extractMetadataFromContent(content, key, buildDate);
      return {
        path: routePath,
        title: metadata.title,
        description: metadata.description,
        type: routePath.startsWith('/forms/') ? 'form' : 'page',
        excerpt: metadata.description,
        lastmod: metadata.lastmod,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function searchRoutes(query: string, buildDate: string): ContentRoute[] {
  const q = query.trim().toLowerCase();
  const routes = getPublicPageRoutes(buildDate);
  if (!q) return routes.slice(0, 12);

  return routes
    .filter((route) => {
      const haystack = `${route.path} ${route.title} ${route.description} ${route.excerpt ?? ''}`.toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, 20);
}
