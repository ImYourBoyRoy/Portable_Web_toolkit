// ./Web_Toolkit/site_quality_smoke/src/lib/opengraph.mjs
/**
 * Open Graph extraction and live fetch validation for social crawlers.
 */

const FACEBOOK_CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

function readMetaProperty(html = '', property = '') {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta\\s+property=["']${escaped}["']\\s+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${escaped}["']`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function readMetaName(html = '', name = '') {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta\\s+name=["']${escaped}["']\\s+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+name=["']${escaped}["']`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

export function openGraphFromHtml(html = '') {
  return {
    title: readMetaProperty(html, 'og:title'),
    description: readMetaProperty(html, 'og:description'),
    type: readMetaProperty(html, 'og:type'),
    url: readMetaProperty(html, 'og:url'),
    image: readMetaProperty(html, 'og:image'),
    imageSecureUrl: readMetaProperty(html, 'og:image:secure_url'),
    imageType: readMetaProperty(html, 'og:image:type'),
    imageWidth: readMetaProperty(html, 'og:image:width'),
    imageHeight: readMetaProperty(html, 'og:image:height'),
    imageAlt: readMetaProperty(html, 'og:image:alt'),
    siteName: readMetaProperty(html, 'og:site_name'),
    twitterCard: readMetaName(html, 'twitter:card'),
    twitterImage: readMetaName(html, 'twitter:image')
  };
}

function isImageContentType(contentType = '') {
  return /^image\//i.test(String(contentType || '').split(';')[0].trim());
}

function looksLikeChallenge(body = '', headers = {}) {
  const server = String(headers.server || '').toLowerCase();
  const cfMitigated = String(headers['cf-mitigated'] || '').toLowerCase();
  const snippet = String(body || '').slice(0, 1200).toLowerCase();
  return cfMitigated === 'challenge'
    || snippet.includes('just a moment')
    || snippet.includes('cf-browser-verification')
    || snippet.includes('attention required')
    || (server.includes('cloudflare') && snippet.includes('<title>access denied</title>'));
}

function imageFormatWarnings(imageUrl = '', contentType = '') {
  const warnings = [];
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  const path = (() => {
    try {
      return new URL(imageUrl).pathname.toLowerCase();
    } catch {
      return imageUrl.toLowerCase();
    }
  })();

  if (type === 'image/webp' || path.endsWith('.webp')) {
    warnings.push('Open Graph image is WebP; Facebook link previews are more reliable with PNG or JPEG.');
  }
  if (type === 'image/svg+xml' || path.endsWith('.svg')) {
    warnings.push('Open Graph image is SVG; social crawlers expect raster PNG or JPEG.');
  }
  return warnings;
}

async function probeImage(url, requestUrl, userAgent = '') {
  const headers = userAgent ? { 'user-agent': userAgent } : {};
  const response = await requestUrl(url, { method: 'HEAD', headers });
  let status = response.status;
  let contentType = String(response.headers['content-type'] || '');
  let challenge = looksLikeChallenge(response.body, response.headers);

  if (!isImageContentType(contentType) || status < 200 || status >= 400) {
    const getResponse = await requestUrl(url, { headers });
    status = getResponse.status;
    contentType = String(getResponse.headers['content-type'] || contentType);
    challenge = challenge || looksLikeChallenge(getResponse.body, getResponse.headers);
  }

  return {
    url,
    ok: status >= 200 && status < 400 && isImageContentType(contentType) && !challenge,
    status,
    contentType,
    durationMs: response.durationMs,
    challenge,
    warnings: imageFormatWarnings(url, contentType),
    error: response.error || ''
  };
}

export async function openGraphReport(html = '', { origin = '', host = '', requestUrl, allowCrossHostUrl = false } = {}) {
  const tags = openGraphFromHtml(html);
  const imageUrl = tags.image ? new URL(tags.image, origin).toString() : '';
  const urlHost = (() => {
    try {
      return tags.url ? new URL(tags.url).hostname : '';
    } catch {
      return '';
    }
  })();
  const imageHost = (() => {
    try {
      return imageUrl ? new URL(imageUrl).hostname : '';
    } catch {
      return '';
    }
  })();

  const missing = ['title', 'description', 'url', 'image'].filter((key) => !tags[key]);
  const imageAbsolute = Boolean(
    tags.image && (/^https?:\/\//i.test(tags.image) || tags.image.startsWith('/'))
  );
  const imageHostMatches = !host || !imageHost || imageHost === host;
  const urlHostMatches = !host || !urlHost || urlHost === host || allowCrossHostUrl;

  let defaultImage = null;
  let facebookImage = null;
  if (imageUrl && requestUrl) {
    defaultImage = await probeImage(imageUrl, requestUrl);
    facebookImage = await probeImage(imageUrl, requestUrl, FACEBOOK_CRAWLER_UA);
  }

  const warnings = [
    ...new Set([
      ...(defaultImage?.warnings || []),
      ...(facebookImage?.warnings || []),
      ...(!tags.imageType ? ['og:image:type is missing.'] : []),
      ...(!tags.imageWidth || !tags.imageHeight ? ['og:image width/height hints are incomplete.'] : []),
      ...(tags.twitterCard && tags.twitterCard !== 'summary_large_image' ? [`twitter:card is "${tags.twitterCard}" instead of summary_large_image.`] : [])
    ])
  ];

  return {
    tags,
    imageUrl,
    missing,
    imageAbsolute,
    imageHostMatches,
    urlHostMatches,
    defaultImage,
    facebookImage,
    warnings
  };
}

export function summarizeOpenGraphIssues(openGraph = {}) {
  const issues = [];
  if (openGraph.missing?.length) {
    issues.push(`Open Graph tags missing: ${openGraph.missing.map((key) => `og:${key}`).join(', ')}.`);
  }
  if (openGraph.tags?.image && !openGraph.imageAbsolute) {
    issues.push('Open Graph image URL is not absolute.');
  }
  if (openGraph.tags?.image && openGraph.imageHostMatches === false) {
    issues.push('Open Graph image host does not match the production host.');
  }
  if (openGraph.tags?.url && openGraph.urlHostMatches === false) {
    issues.push('Open Graph url host does not match the production host.');
  }
  if (openGraph.tags?.image && openGraph.defaultImage && !openGraph.defaultImage.ok) {
    const detail = openGraph.defaultImage.challenge
      ? 'challenge or bot block detected'
      : `status ${openGraph.defaultImage.status}, content-type ${openGraph.defaultImage.contentType || 'missing'}`;
    issues.push(`Open Graph image is not fetchable (${detail}).`);
  }
  if (openGraph.tags?.image && openGraph.facebookImage && !openGraph.facebookImage.ok) {
    const detail = openGraph.facebookImage.challenge
      ? 'Facebook crawler appears blocked by edge challenge/WAF'
      : `status ${openGraph.facebookImage.status}, content-type ${openGraph.facebookImage.contentType || 'missing'}`;
    issues.push(`Open Graph image is not fetchable for Facebook crawler (${detail}).`);
  }
  for (const warning of openGraph.warnings || []) {
    issues.push(`Open Graph warning: ${warning}`);
  }
  return issues;
}
