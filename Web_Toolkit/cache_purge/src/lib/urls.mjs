// ./Web_Toolkit/cache_purge/src/lib/urls.mjs
/**
 * Pure helpers that turn a build output folder, profile hosts, and flags into
 * the list of public URLs (or URL prefixes) a Cloudflare purge should target.
 *
 * Used by: cache_purge/src/commands/purge.mjs (and unit tests).
 * Inputs: project root, site profile, host list, optional explicit overrides.
 * Outputs: sorted, de-duplicated URL strings and batch-size decisions.
 * Side effects: read-only filesystem access under `<project>/dist`.
 * Notes: no network access here; Astro's Cloudflare Workers adapter writes
 * public files to `dist/client`, so that folder is used instead of `dist/`.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Cloudflare single-file and prefix purges accept up to 100 items per request on Free/Pro/Business. */
export const DEFAULT_BATCH_SIZE = 100;
/** Enterprise single-file purges accept up to 500 items per request. */
export const MAX_BATCH_SIZE = 500;

const SKIPPED_FILES = new Set(['_headers', '_redirects', '_routes.json', '.assetsignore', '.DS_Store']);
const HASHED_ASSET_DIR = '_astro';

export function normalizeSubdir(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve the folder that mirrors the public site.
 * Order: profile `cloudflare.cachePurge.distSubdir`, profile `cloudflare.headers.distSubdir`,
 * auto-detected Astro Workers layout (`dist/client` next to `dist/server`), then `dist/`.
 */
export function resolveDistRoot(projectRoot, profile = {}) {
  const distRoot = path.join(projectRoot, 'dist');
  const configured = normalizeSubdir(
    profile?.cloudflare?.cachePurge?.distSubdir ?? profile?.cloudflare?.headers?.distSubdir
  );
  if (configured) {
    const resolved = path.resolve(distRoot, configured);
    const relative = path.relative(distRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`distSubdir "${configured}" must stay inside dist/.`);
    }
    return resolved;
  }
  const clientRoot = path.join(distRoot, 'client');
  if (isDirectory(clientRoot) && isDirectory(path.join(distRoot, 'server'))) return clientRoot;
  return distRoot;
}

function routePathFor(relative) {
  const segments = relative.split('/');
  const file = segments.pop();
  const encoded = segments.map((segment) => encodeURIComponent(segment));
  if (file === 'index.html') return encoded.length === 0 ? '/' : `/${encoded.join('/')}/`;
  return `/${[...encoded, encodeURIComponent(file)].join('/')}`;
}

/**
 * Walk a public output folder and return `https://<host><path>` for every file.
 * Skips source maps, edge-config files, and (by default) content-hashed `_astro/` assets,
 * which never need invalidating because their filenames change with their content.
 */
export function collectDistUrls(distRoot, hosts, { includeAssets = false } = {}) {
  if (!isDirectory(distRoot)) return [];
  const routes = [];
  const queue = [distRoot];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      const relative = path.relative(distRoot, fullPath).replace(/\\/g, '/');
      if (relative.endsWith('.map') || SKIPPED_FILES.has(entry.name)) continue;
      if (!includeAssets && relative.split('/')[0] === HASHED_ASSET_DIR) continue;
      routes.push(routePathFor(relative));
    }
  }
  return buildUrls(hosts, [...new Set(routes)].sort());
}

export function buildUrls(hosts, routes) {
  const urls = [];
  for (const host of hosts) {
    for (const route of routes) {
      const normalized = route.startsWith('/') ? route : `/${route}`;
      urls.push(`https://${host}${normalized}`);
    }
  }
  return [...new Set(urls)];
}

/** Add the slashless twin of every non-root directory URL (`/about/` also purges `/about`). */
export function expandUrlVariants(urls) {
  const expanded = [];
  for (const url of urls) {
    expanded.push(url);
    const parsed = new URL(url);
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/') && !parsed.search) {
      expanded.push(`${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`);
    }
  }
  return [...new Set(expanded)];
}

/**
 * Convert a URL to a Cloudflare prefix: host plus path, no scheme, query, fragment,
 * or trailing slash. A root URL becomes the bare host, which purges the whole host.
 */
export function toPrefix(url) {
  const parsed = new URL(url);
  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.host}${pathname}`;
}

export function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

/** Batch size precedence: --batch-size, profile cachePurge.batchSize, CF_CACHE_PURGE_BATCH_SIZE, default 100. */
export function resolveBatchSize({ flags = {}, profile = {}, env = {} } = {}) {
  const raw = [
    flags['batch-size'],
    profile?.cloudflare?.cachePurge?.batchSize,
    env.CF_CACHE_PURGE_BATCH_SIZE
  ].find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  if (raw === undefined) return DEFAULT_BATCH_SIZE;
  const parsed = Number(String(raw).trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid purge batch size "${raw}". Use a whole number from 1 to ${MAX_BATCH_SIZE}.`);
  }
  return Math.min(parsed, MAX_BATCH_SIZE);
}
