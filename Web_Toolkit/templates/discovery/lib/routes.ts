// ./src/lib/discovery/routes.ts
/** Public route index for content.json, search.json, and llms manifests. */

import { extractMetadataFromContent } from '../metadata-extractor';
import { canonicalPagePath, markdownPathFor } from './site';

export type ContentRoute = {
  /** Canonical path: pages end with a slash (see canonicalPagePath). */
  path: string;
  /**
   * Path of the page's Markdown twin, generated after the build by scripts/discovery-postbuild.mjs.
   * null for server-rendered pages (`export const prerender = false`): they have no static HTML to convert.
   */
  markdownPath: string | null;
  title: string;
  description: string;
  type: 'page' | 'policy' | 'form';
  excerpt?: string;
  /** ISO date of the last meaningful change, or null when unknown. Never the build clock. */
  lastmod: string | null;
};

// Optional git-derived dates written by scripts/refresh-page-lastmod.mjs (src/data/page-lastmod.json).
const lastmodFiles = import.meta.glob('../../data/page-lastmod.json', { eager: true, import: 'default' }) as Record<string, { pages?: Record<string, string> }>;
const lastmodByPath: Record<string, string> = Object.values(lastmodFiles)[0]?.pages ?? {};

/**
 * What a page without an explicit `export const prerender` does. Astro prerenders by default with `output: 'static'` (true)
 * and renders on demand with `output: 'server'` (false): match astro.config.mjs. Only prerendered pages get a Markdown twin.
 */
const DEFAULT_PRERENDER: boolean = true;
const isPrerendered = (source: string): boolean => {
  const declared = source.match(/export\s+const\s+prerender\s*=\s*(true|false)/);
  return declared ? declared[1] === 'true' : DEFAULT_PRERENDER;
};

const pageModules = import.meta.glob('../../pages/**/*.{astro,md,mdx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const INTERNAL_ROUTE_SUFFIXES = [
  'robots.txt.ts',
  'ai.txt.ts',
  'well-known/api-catalog.ts',
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
  if (key.includes('/admin/') || key.includes('/api/') || key.includes('/.well-known/')) return false;
  if (key.endsWith('/404.astro') || key.endsWith('/500.astro')) return false;
  if (key.includes('[') || key.includes(']')) return false;
  if (INTERNAL_ROUTE_SUFFIXES.some((name) => key.endsWith(name))) return false;
  return true;
}

/** `buildDate` is accepted for backward compatibility and ignored: dates come from frontmatter or page-lastmod.json. */
export function getPublicPageRoutes(_buildDate?: string): ContentRoute[] {
  return Object.entries(pageModules)
    .filter(([key]) => isPublicPageKey(key))
    .map(([key, content]): ContentRoute => {
      const segment = segmentFromKey(key);
      const routePath = canonicalPagePath(segment ? `/${segment}` : '/');
      const metadata = extractMetadataFromContent(content, key, '');
      return {
        path: routePath,
        markdownPath: isPrerendered(content) ? markdownPathFor(routePath) : null,
        title: metadata.title,
        description: metadata.description,
        type: routePath.startsWith('/forms/') ? 'form' : 'page',
        excerpt: metadata.description,
        lastmod: metadata.lastmod || lastmodByPath[routePath] || null,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function searchRoutes(query: string, _buildDate?: string): ContentRoute[] {
  const q = query.trim().toLowerCase();
  const routes = getPublicPageRoutes();
  if (!q) return routes.slice(0, 12);

  return routes
    .filter((route) => {
      const haystack = `${route.path} ${route.title} ${route.description} ${route.excerpt ?? ''}`.toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, 20);
}
