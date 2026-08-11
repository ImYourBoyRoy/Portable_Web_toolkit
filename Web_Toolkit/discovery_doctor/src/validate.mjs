// ./Web_Toolkit/discovery_doctor/src/validate.mjs
/**
 * Content validators for discovery-doctor (sitemap, robots, JSON, JSON-LD).
 */

export function looksLikeSitemapXml(text = '') {
  const body = String(text || '');
  return /<urlset[\s>]/i.test(body) || /<sitemapindex[\s>]/i.test(body);
}

export function looksLikeJson(text = '') {
  try {
    JSON.parse(String(text || ''));
    return true;
  } catch {
    return false;
  }
}

export function robotsReferencesSitemap(text = '') {
  return /^\s*sitemap:\s*\S+/im.test(String(text || ''));
}

export function robotsHasExactDisallowAll(text = '') {
  return /^\s*disallow:\s*\/\s*$/im.test(String(text || ''));
}

/**
 * @param {string} html
 * @returns {{ hasJsonLd: boolean, types: string[], hasWebIdentity: boolean, hasBreadcrumb: boolean }}
 */
export function analyzeJsonLd(html = '') {
  const types = new Set();
  let hasJsonLd = false;
  for (const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    hasJsonLd = true;
    const raw = match[1] || '';
    try {
      const parsed = JSON.parse(raw);
      collectTypes(parsed, types);
    } catch {
      // keep hasJsonLd true; type extraction best-effort
      if (/WebSite/i.test(raw)) types.add('WebSite');
      if (/Organization/i.test(raw)) types.add('Organization');
      if (/Person/i.test(raw)) types.add('Person');
      if (/BreadcrumbList/i.test(raw)) types.add('BreadcrumbList');
    }
  }
  if (!hasJsonLd && /application\/ld\+json/i.test(html)) {
    hasJsonLd = true;
  }
  const list = [...types];
  return {
    hasJsonLd,
    types: list,
    hasWebIdentity: list.some((t) => ['WebSite', 'Organization', 'Person'].includes(t)),
    hasBreadcrumb: list.includes('BreadcrumbList')
  };
}

function collectTypes(node, types) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, types);
    return;
  }
  if (node['@type']) {
    const value = node['@type'];
    if (Array.isArray(value)) value.forEach((t) => types.add(String(t)));
    else types.add(String(value));
  }
  if (Array.isArray(node['@graph'])) {
    for (const item of node['@graph']) collectTypes(item, types);
  }
}

export function findFileInBuild(distPath, itemPath, fs, path) {
  const cleanPath = String(itemPath).split('?')[0];
  const candidates = [
    path.join(distPath, cleanPath),
    path.join(distPath, 'client', cleanPath)
  ];
  if (!cleanPath.includes('.')) {
    candidates.push(
      path.join(distPath, cleanPath, 'index.html'),
      path.join(distPath, 'client', cleanPath, 'index.html')
    );
  }
  for (const fullPath of candidates) {
    if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) return fullPath;
  }
  return null;
}

export function findFirstExisting(distPath, relativePaths, fs, path) {
  for (const relative of relativePaths) {
    const found = findFileInBuild(distPath, relative, fs, path);
    if (found) return { relative, found };
  }
  return null;
}
