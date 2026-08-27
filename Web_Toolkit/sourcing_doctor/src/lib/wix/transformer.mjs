// ./Web_Toolkit/sourcing_doctor/src/lib/wix/transformer.mjs
/**
 * Maps public Wix storefront HTML / JSON-LD into ContentManifest + catalog records.
 *
 * Category rules, rebuild product paths, and phone numbers come from the site
 * profile. This module must not bake a single client's catalog taxonomy.
 */

export function compileCategoryRules(rules = [], defaultCategory = 'Uncategorized') {
  const compiled = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    const category = String(rule?.category || '').trim();
    const pattern = String(rule?.pattern || '').trim();
    if (!category || !pattern) continue;
    compiled.push({ category, pattern: new RegExp(pattern, rule.flags || 'i') });
  }
  return { rules: compiled, defaultCategory: String(defaultCategory || 'Uncategorized') };
}

export function inferCategory(name = '', categoryConfig = compileCategoryRules()) {
  for (const rule of categoryConfig.rules) {
    if (rule.pattern.test(name)) return rule.category;
  }
  return categoryConfig.defaultCategory;
}

export function inferSku(name = '') {
  const match = String(name).trim().match(/^([A-Z]{1,6}\d[\w-]*|\d{3,}[\w-]*)/i);
  return match ? match[1].toUpperCase() : null;
}

export function stripHtml(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function jsonLdTypeIs(entry, typeName) {
  const types = asArray(entry?.['@type']).map((item) => String(item || '').trim());
  return types.includes(typeName);
}

export function pickProductJsonLd(blocks = []) {
  for (const block of asArray(blocks)) {
    if (jsonLdTypeIs(block, 'Product')) return block;
    if (Array.isArray(block?.['@graph'])) {
      const nested = block['@graph'].find((entry) => jsonLdTypeIs(entry, 'Product'));
      if (nested) return nested;
    }
  }
  return null;
}

export function pickOffer(product) {
  const offers = asArray(product?.offers);
  return offers[0] && typeof offers[0] === 'object' ? offers[0] : {};
}

export function imageUrlFromJsonLd(product) {
  const image = asArray(product?.image)[0];
  if (!image) return '';
  const raw = typeof image === 'string' ? image : image.contentUrl || image.url || '';
  return upgradeWixMediaUrl(raw);
}

/**
 * Strip Wix fit/fill derivatives. The original file is the highest native
 * resolution; requesting 2000px fills only upscales small uploads.
 */
export function upgradeWixMediaUrl(url = '') {
  const source = String(url || '');
  if (!source.includes('static.wixstatic.com/media/')) return source;
  const media = source.match(/^(https:\/\/static\.wixstatic\.com\/media\/[^/?#]+)/i);
  return media ? media[1] : source;
}

export function extractPhone(text = '', fallback = '') {
  const match = String(text).match(/(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4})/);
  if (match) {
    return `${match[1] || ''}${match[2]}`.replace(/\s+/g, ' ').trim();
  }
  return String(fallback || '').trim();
}

export function productFromJsonLd(slug, origin, jsonLdBlocks, fallbackUrl, options = {}) {
  const product = pickProductJsonLd(jsonLdBlocks);
  const name = product?.name || slug.replace(/-/g, ' ').toUpperCase();
  const offer = pickOffer(product);
  const priceRaw = offer.price ?? offer.lowPrice ?? null;
  const price = priceRaw === null || priceRaw === undefined ? null : Number(priceRaw);
  const currency = offer.priceCurrency || 'USD';
  const availabilityRaw = String(offer.availability || '');
  const availability = availabilityRaw.includes('OutOfStock')
    ? 'OutOfStock'
    : availabilityRaw.includes('InStock')
      ? 'InStock'
      : 'Unknown';
  const imageRemote = imageUrlFromJsonLd(product);
  const rebuildPrefix = options.rebuildProductPath || '/product/';
  const normalizedRebuild = rebuildPrefix.endsWith('/') ? rebuildPrefix : `${rebuildPrefix}/`;
  const wixUrl = offer.url || fallbackUrl || `${origin}/product-page/${slug}`;
  const categoryConfig = compileCategoryRules(options.categoryRules, options.defaultCategory);

  return {
    slug,
    name,
    sku: inferSku(name),
    description: stripHtml(product?.description || ''),
    price: Number.isFinite(price) ? price : null,
    priceFormatted: Number.isFinite(price)
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price)
      : '',
    currency,
    availability,
    imageRemote,
    image: imageRemote,
    category: inferCategory(name, categoryConfig),
    wixUrl,
    path: `${normalizedRebuild}${slug}`,
    provenance: {
      source: 'wix-public-jsonld',
      original_url: wixUrl
    }
  };
}

export function transformWixToContentManifest(products, pages) {
  const productEntries = products.map((item) => ({
    id: item.slug,
    slug: item.slug,
    status: 'publish',
    type: 'product',
    title: item.name,
    content: item.description,
    excerpt: item.description.slice(0, 180),
    date: null,
    modified: null,
    link: item.wixUrl,
    featured_media: item.image,
    provenance: item.provenance
  }));

  const pageEntries = pages.map((page) => ({
    id: page.slug,
    slug: page.slug,
    status: 'publish',
    type: 'page',
    title: page.title,
    content: page.content,
    excerpt: page.excerpt || page.content.slice(0, 180),
    date: null,
    modified: null,
    link: page.originalUrl,
    featured_media: '',
    provenance: {
      source: 'wix-public-html',
      original_url: page.originalUrl
    }
  }));

  return [...pageEntries, ...productEntries];
}

export function generateWixUrlMap(products, pages) {
  const pageRows = pages.map((page) => ({
    original_url: page.originalUrl,
    new_path: page.path,
    status_code: 301
  }));
  const productRows = products.map((item) => ({
    original_url: item.wixUrl,
    new_path: item.path,
    status_code: 200
  }));
  return [...pageRows, ...productRows];
}

export function generateWixImageManifest(products) {
  return products
    .filter((item) => item.imageRemote)
    .map((item) => {
      const extMatch = item.imageRemote.match(/\.(jpe?g|png|webp|gif|avif)(?:$|\?)/i);
      const ext = (extMatch?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
      return {
        id: item.slug,
        title: item.name,
        slug: item.slug,
        source_url: item.imageRemote,
        mime_type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        alt_text: item.name,
        local_path: `public/assets/sourced/${item.slug}.${ext}`
      };
    });
}

export function visibleText(html = '') {
  return stripHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  );
}
