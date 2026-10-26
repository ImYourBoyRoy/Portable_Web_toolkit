// ./Web_Toolkit/sourcing_doctor/src/lib/wix/client.mjs
/**
 * Public Wix storefront harvest (no admin / API keys).
 *
 * Reads shop pagination and product-page JSON-LD that Wix already exposes
 * to crawlers. Shop path, product URL prefix, and rate-limit come from the
 * caller (site profile), not from a specific client site.
 *
 * Run via: sourcing-doctor extract --site-profile <profile>
 */

import { assertPublicHttpUrl } from '../../../../shared/lib/url-safety.mjs';

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; PortableWebToolkit-SourcingDoctor/1.0; +https://github.com/imyourboyroy/Portable_Web_toolkit)';
const DEFAULT_PRODUCT_PREFIX = '/product-page/';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeOrigin(baseUrl) {
  return assertPublicHttpUrl(baseUrl, 'Wix site URL').origin;
}

export function normalizeShopPaths(shopPath, shopPaths) {
  const raw = shopPaths ?? shopPath ?? ['/', '/shop'];
  const list = Array.isArray(raw) ? raw : [raw];
  const cleaned = list
    .map((entry) => {
      const value = String(entry || '/').trim() || '/';
      if (value === '/') return '/';
      return value.startsWith('/') ? value.replace(/\/+$/, '') : `/${value.replace(/\/+$/, '')}`;
    })
    .filter(Boolean);
  return [...new Set(cleaned.length > 0 ? cleaned : ['/'])];
}

export function buildShopPageUrl(origin, shopPath, page) {
  const base = shopPath === '/' ? `${origin}/` : `${origin}${shopPath}`;
  if (page <= 1) return base;
  const joiner = base.includes('?') ? '&' : '?';
  return `${base}${joiner}page=${page}`;
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function fetchWixHtml(
  urlInput,
  { delayMs = 900, retries = 4, userAgent = DEFAULT_UA, allowNotFound = false } = {}
) {
  const url = assertPublicHttpUrl(urlInput, 'Wix page URL').href;
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 1) await sleep(delayMs * attempt);
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml'
        }
      });
      if (allowNotFound && response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Wix fetch ${response.status} ${response.statusText} for ${url}`);
      }
      const html = await response.text();
      await sleep(delayMs);
      return html;
    } catch (error) {
      lastError = error;
      if (allowNotFound && / 404 /.test(String(error.message))) return null;
      console.warn(`[WARN] Wix fetch attempt ${attempt}/${retries} failed: ${url} (${error.message})`);
    }
  }
  throw lastError;
}

export function extractProductSlugs(html, productPathPrefix = DEFAULT_PRODUCT_PREFIX) {
  const prefix = productPathPrefix.endsWith('/') ? productPathPrefix : `${productPathPrefix}/`;
  const slugs = new Set();
  const pattern = new RegExp(`${escapeRegExp(prefix)}([a-z0-9-]+)`, 'gi');
  let match;
  while ((match = pattern.exec(html)) !== null) {
    slugs.add(match[1].toLowerCase());
  }
  return [...slugs];
}

export function extractJsonLdBlocks(html) {
  const blocks = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      try {
        blocks.push(JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')));
      } catch {
        // Wix sometimes emits invalid JSON-LD; skip quietly.
      }
    }
  }
  return blocks;
}

export async function collectShopSlugs(origin, options = {}) {
  const maxPages = options.maxPages ?? 40;
  const prefix = options.productPathPrefix || DEFAULT_PRODUCT_PREFIX;
  const shopPaths = normalizeShopPaths(options.shopPath, options.shopPaths);
  const seen = new Set();

  for (const shopPath of shopPaths) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = buildShopPageUrl(origin, shopPath, page);
      console.log(`[INFO] Wix shop ${shopPath} page ${page}: ${url}`);
      const html = await fetchWixHtml(url, { ...options, allowNotFound: true });
      if (!html) {
        console.log(`[INFO] No page at ${url}; stopping this shop path.`);
        break;
      }
      const slugs = extractProductSlugs(html, prefix);
      const before = seen.size;
      slugs.forEach((slug) => seen.add(slug));
      const added = seen.size - before;
      console.log(`[INFO] Page ${page} added ${added} slugs (total ${seen.size})`);
      if (added === 0) break;
    }
  }

  return [...seen].sort();
}

export async function fetchProductPage(origin, slug, options = {}) {
  const prefix = options.productPathPrefix || DEFAULT_PRODUCT_PREFIX;
  const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const url = `${origin}${normalized}${slug}`;
  const html = await fetchWixHtml(url, options);
  return { slug, url, html, jsonLd: extractJsonLdBlocks(html) };
}

export async function fetchStaticPage(origin, path, options = {}) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = `${origin}${normalized}`;
  const html = await fetchWixHtml(url, { ...options, allowNotFound: true });
  if (!html) return { path: normalized, url, html: null, jsonLd: [] };
  return { path: normalized, url, html, jsonLd: extractJsonLdBlocks(html) };
}
