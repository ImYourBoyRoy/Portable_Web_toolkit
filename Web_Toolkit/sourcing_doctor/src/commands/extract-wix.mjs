// ./Web_Toolkit/sourcing_doctor/src/commands/extract-wix.mjs
/**
 * Harvest a public Wix Stores site into manifests + optional local media.
 *
 * Does not require Wix admin, API keys, or Headless OAuth. Site-specific
 * pages, category rules, and phone numbers come from profile.sourcing.
 *
 * Run: sourcing-doctor extract --site-profile <profile>
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  collectShopSlugs,
  fetchProductPage,
  fetchStaticPage,
  normalizeOrigin
} from '../lib/wix/client.mjs';
import {
  extractPhone,
  generateWixImageManifest,
  generateWixUrlMap,
  productFromJsonLd,
  transformWixToContentManifest,
  visibleText
} from '../lib/wix/transformer.mjs';
import { downloadAssetBatch } from '../lib/shared/downloader.mjs';

const DEFAULT_PAGES = [
  { path: '/faq', slug: 'faq', title: 'FAQ' },
  { path: '/contact', slug: 'contact', title: 'Contact' }
];

function csvEscape(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

async function writeCsv(path, headers, rows) {
  const body = [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
  await writeFile(path, `${body}\n`);
}

function resolveStaticPages(sourcing = {}) {
  if (Array.isArray(sourcing.pages)) return sourcing.pages;
  return DEFAULT_PAGES;
}

function excerptFrom(text, fallback) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return fallback || '';
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}

export async function runWixExtract(profile, projectRoot) {
  const sourcing = profile.sourcing || {};
  const origin = normalizeOrigin(sourcing.url);
  const includeMedia = sourcing.includeMedia !== false;
  const delayMs = Number(sourcing.delayMs || 900);
  const maxProducts = Number(sourcing.maxProducts || 0);
  const catalogPath = String(sourcing.writeCatalog || 'src/data/catalog.json').replace(/^\/+/, '');
  const options = {
    delayMs,
    maxPages: Number(sourcing.maxPages || 40),
    shopPath: sourcing.shopPath,
    shopPaths: sourcing.shopPaths,
    productPathPrefix: sourcing.productPathPrefix || '/product-page/'
  };

  console.log(`[INFO] Starting Wix public harvest for ${profile.siteId} from ${origin}`);

  let slugs = await collectShopSlugs(origin, options);
  if (maxProducts > 0) slugs = slugs.slice(0, maxProducts);
  console.log(`[INFO] Found ${slugs.length} product slugs`);

  const transformOptions = {
    categoryRules: sourcing.categoryRules,
    defaultCategory: sourcing.defaultCategory,
    rebuildProductPath: sourcing.rebuildProductPath || '/product/'
  };

  const products = [];
  for (const slug of slugs) {
    console.log(`[INFO] Product ${products.length + 1}/${slugs.length}: ${slug}`);
    const page = await fetchProductPage(origin, slug, options);
    products.push(productFromJsonLd(slug, origin, page.jsonLd, page.url, transformOptions));
  }

  const pages = [];
  for (const spec of resolveStaticPages(sourcing)) {
    const path = String(spec.path || '').trim();
    if (!path) continue;
    const fetched = await fetchStaticPage(origin, path, options);
    if (!fetched.html) {
      console.log(`[INFO] Skipping missing Wix page ${path}`);
      continue;
    }
    const content = visibleText(fetched.html).replace(/\s*bottom of page.*$/i, '').trim();
    const slug = String(spec.slug || path.replace(/^\//, '') || 'page').replace(/[^\w.-]+/g, '-');
    pages.push({
      slug,
      title: spec.title || slug,
      path: spec.rebuildPath || (path.startsWith('/') ? path : `/${path}`),
      originalUrl: fetched.url,
      content,
      excerpt: spec.excerpt || excerptFrom(content, spec.title || slug)
    });
  }

  const harvestedText = [pages.map((page) => page.content).join(' '), ...products.map((item) => item.description)].join(' ');
  const phone = String(sourcing.phone || profile.contact?.phone || extractPhone(harvestedText) || '').trim();

  const contentManifest = transformWixToContentManifest(products, pages);
  const urlMap = generateWixUrlMap(products, pages);
  const imageManifest = generateWixImageManifest(products);

  const outDir = join(projectRoot, 'legacy_sourcing');
  await mkdir(outDir, { recursive: true });
  await mkdir(join(projectRoot, dirname(catalogPath)), { recursive: true });

  const catalog = {
    source: origin,
    harvestedAt: new Date().toISOString(),
    phone,
    productCount: products.length,
    categories: [...new Set(products.map((item) => item.category))].sort(),
    products,
    pages
  };

  await writeFile(join(outDir, 'ContentManifest.json'), JSON.stringify(contentManifest, null, 2));
  await writeFile(join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
  await writeFile(join(projectRoot, catalogPath), JSON.stringify(catalog, null, 2));
  await writeFile(join(projectRoot, 'ContentManifest.json'), JSON.stringify(contentManifest, null, 2));

  await writeCsv(
    join(projectRoot, 'URLMap.csv'),
    ['original_url', 'new_path', 'status_code'],
    urlMap.map((row) => [row.original_url, row.new_path, row.status_code])
  );
  await writeCsv(
    join(outDir, 'URLMap.csv'),
    ['original_url', 'new_path', 'status_code'],
    urlMap.map((row) => [row.original_url, row.new_path, row.status_code])
  );

  await writeCsv(
    join(projectRoot, 'ImageManifest.csv'),
    ['source_url', 'local_path', 'alt_text'],
    imageManifest.map((row) => [row.source_url, row.local_path, row.alt_text])
  );
  await writeCsv(
    join(outDir, 'ImageManifest.csv'),
    ['source_url', 'local_path', 'alt_text'],
    imageManifest.map((row) => [row.source_url, row.local_path, row.alt_text])
  );

  if (includeMedia && imageManifest.length > 0) {
    console.log(`[INFO] Downloading ${imageManifest.length} product images...`);
    const downloadResults = await downloadAssetBatch(
      imageManifest.map((img) => ({ url: img.source_url, localPath: img.local_path })),
      projectRoot,
      { delayMs: Math.min(delayMs, 250) }
    );
    console.log(
      `[INFO] Media download complete: ${downloadResults.success} success, ${downloadResults.failed} failed.`
    );

    const localBySlug = new Map(imageManifest.map((img) => [img.slug, `/${img.local_path.replace(/^public\//, '')}`]));
    for (const product of products) {
      const local = localBySlug.get(product.slug);
      if (local) product.image = local;
    }
    catalog.products = products;
    await writeFile(join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    await writeFile(join(projectRoot, catalogPath), JSON.stringify(catalog, null, 2));
  }

  console.log(`[SUCCESS] Wix harvest complete for ${profile.siteId}: ${products.length} products, ${pages.length} pages.`);
  return catalog;
}
