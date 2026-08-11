// ./Web_Toolkit/site_quality_smoke/src/lib/compliance.mjs
/**
 * Best-effort HTML checks for legal/privacy links, cookie notices,
 * on-page image formats, and remote font CDNs.
 *
 * HTML-only (no browser DOM). JS-injected banners may be missed — pair with
 * browser-diagnostics when needed.
 */

const DEFAULT_PRIVACY_PATHS = Object.freeze([
  '/privacy',
  '/privacy-policy',
  '/legal',
  '/legal-privacy',
  '/terms',
  '/terms-of-service',
  '/cookie-policy',
  '/cookies'
]);

const REMOTE_FONT_HOSTS = Object.freeze([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.typekit.net',
  'p.typekit.net',
  'fonts.adobe.com',
  'fonts.bunny.net',
  'fontlibrary.org',
  'use.fontawesome.com'
]);

const ANALYTICS_PATTERNS = Object.freeze([
  { id: 'google-tag-manager', re: /googletagmanager\.com|GTM-[A-Z0-9]+/i },
  { id: 'ga4', re: /google-analytics\.com|gtag\s*\(|['"]G-[A-Z0-9]{6,}['"]|PUBLIC_GA4_MEASUREMENT_ID/i },
  { id: 'posthog', re: /posthog|PUBLIC_POSTHOG_API_KEY|us\.i\.posthog\.com|eu\.i\.posthog\.com/i },
  { id: 'plausible', re: /plausible\.io/i },
  { id: 'fathom', re: /cdn\.usefathom\.com/i },
  { id: 'clarity', re: /clarity\.ms/i },
  { id: 'hotjar', re: /static\.hotjar\.com|hotjar\.com\/c/i },
  { id: 'segment', re: /cdn\.segment\.com/i }
]);

const COOKIE_NOTICE_PATTERNS = Object.freeze([
  // Consent / banner UI — not a lone "Cookie Policy" footer link
  { id: 'cookie-banner-text', re: /cookie\s*(banner|notice|consent)|we\s+use\s+cookies|accept\s+cookies|manage\s+cookies|cookie\s+preferences/i },
  { id: 'consent-attr', re: /data-cookie|data-consent|cookieconsent|cookie-banner|cookies-banner|cc-banner|osano|onetrust|cookiebot|termly|complianz/i },
  { id: 'consent-role', re: /aria-label=["'][^"']*cookie[^"']*["']/i }
]);

const LEGAL_HREF_RE = /\/(privacy|privacy-policy|legal|legal-privacy|terms|terms-of-service|cookie-policy|cookies)(?:\/|\.html?)?(?:[?#]|$)/i;
const LEGAL_TEXT_RE = /\b(privacy\s*policy|legal|terms(?:\s+of\s+service)?|cookie\s*policy)\b/i;
const MARKETING_LEGAL_TEXT_RE = /\blegal\s+team\b|\blegal\s+advice\b|\bcontact\s+(?:our\s+)?legal\b/i;
const MODERN_IMAGE_EXT_RE = /\.(?:webp|avif|svg)(?:$|[?#])/i;
const LEGACY_IMAGE_EXT_RE = /\.(?:jpe?g|png|gif|bmp|tiff?)(?:$|[?#])/i;
const SKIP_IMAGE_RE = /(?:favicon|apple-touch-icon|android-chrome|mstile|safari-pinned|data:|blob:)/i;

/** Exact `Disallow: /` line (not `/admin`). */
export function robotsBlocksAll(text = '') {
  return /^\s*disallow:\s*\/\s*$/im.test(String(text || ''));
}

function absolutize(href, origin = '') {
  const raw = String(href || '').trim();
  if (!raw || raw.startsWith('#') || raw.toLowerCase().startsWith('mailto:') || raw.toLowerCase().startsWith('tel:')) {
    return '';
  }
  try {
    return new URL(raw, origin || 'https://example.invalid').toString();
  } catch {
    return '';
  }
}

function hostFromUrl(url = '') {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function pathFromUrl(url = '') {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return String(url || '').toLowerCase();
  }
}

function stripTags(html = '') {
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
}

export function analyzeLegalLinks(html = '', origin = '') {
  const hrefs = [];
  const texts = [];
  for (const match of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] || '';
    const inner = String(match[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    // Require a real path — ignore bare # anchors and empty hrefs
    if (!href || href === '#' || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) {
      continue;
    }
    if (MARKETING_LEGAL_TEXT_RE.test(inner)) continue;

    const absolute = absolutize(href, origin);
    const path = pathFromUrl(absolute || href);
    // Real legal/privacy/terms paths only — text alone is not enough
    const pathLooksLegal = LEGAL_HREF_RE.test(path) || LEGAL_HREF_RE.test(href);
    if (!pathLooksLegal) continue;
    // Prefer path match; text can reinforce but is not required when href is clear
    if (inner && !LEGAL_TEXT_RE.test(inner) && !LEGAL_HREF_RE.test(href) && !LEGAL_HREF_RE.test(path)) {
      continue;
    }
    if (absolute) hrefs.push(absolute);
    if (inner) texts.push(inner.slice(0, 80));
  }
  return {
    linked: hrefs.length > 0,
    hrefs: [...new Set(hrefs)],
    texts: [...new Set(texts)].slice(0, 8)
  };
}

export function analyzeAnalytics(html = '') {
  const signals = [];
  for (const pattern of ANALYTICS_PATTERNS) {
    if (pattern.re.test(html)) signals.push(pattern.id);
  }
  return {
    detected: signals.length > 0,
    signals: [...new Set(signals)]
  };
}

export function analyzeCookieNotice(html = '') {
  const signals = [];
  for (const pattern of COOKIE_NOTICE_PATTERNS) {
    if (pattern.re.test(html)) signals.push(pattern.id);
  }
  return {
    detected: signals.length > 0,
    signals: [...new Set(signals)]
  };
}

function collectPictureModernCoverage(html = '') {
  const coveredLegacy = new Set();
  for (const picture of String(html).matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi)) {
    const block = picture[1] || '';
    const hasModernSource = /<source\b[^>]*type=["']image\/(?:webp|avif)["']/i.test(block)
      || /<source\b[^>]*srcset=["'][^"']+\.(?:webp|avif)(?:[?#][^"']*)?["']/i.test(block);
    if (!hasModernSource) continue;
    for (const img of block.matchAll(/<img\b([^>]*)>/gi)) {
      const src = img[1].match(/\bsrc=["']([^"']+)["']/i)?.[1] || '';
      if (src) coveredLegacy.add(src);
    }
  }
  return coveredLegacy;
}

export function analyzeOnPageImages(html = '', origin = '') {
  const coveredByPicture = collectPictureModernCoverage(html);
  const legacyRaster = [];
  const missingDimensions = [];
  let total = 0;
  let modern = 0;

  for (const match of String(html).matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = match[1] || '';
    const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1] || '';
    const srcset = attrs.match(/\bsrcset=["']([^"']+)["']/i)?.[1] || '';
    const combined = `${src} ${srcset}`.trim();
    if (!combined || SKIP_IMAGE_RE.test(combined)) continue;
    total += 1;

    const width = attrs.match(/\bwidth=["']?(\d+)/i)?.[1];
    const height = attrs.match(/\bheight=["']?(\d+)/i)?.[1];
    const hasDims = Boolean(width && height)
      || /\bstyle=["'][^"']*(?:width|aspect-ratio)/i.test(attrs);
    if (!hasDims) {
      missingDimensions.push({
        src: absolutize(src, origin) || src,
        reason: 'missing width/height (CLS risk)'
      });
    }

    const absolute = absolutize(src, origin) || src;
    const path = pathFromUrl(absolute);
    const modernInSrc = MODERN_IMAGE_EXT_RE.test(path) || MODERN_IMAGE_EXT_RE.test(srcset);
    if (modernInSrc) {
      modern += 1;
      continue;
    }
    if (coveredByPicture.has(src)) {
      modern += 1;
      continue;
    }
    if (LEGACY_IMAGE_EXT_RE.test(path) || LEGACY_IMAGE_EXT_RE.test(srcset)) {
      legacyRaster.push({
        src: absolute,
        reason: 'on-page JPG/PNG/GIF without WebP/AVIF/SVG alternative'
      });
    }
  }

  return {
    total,
    modern,
    legacyRaster: legacyRaster.slice(0, 25),
    missingDimensions: missingDimensions.slice(0, 25)
  };
}

export function analyzeRemoteFonts(html = '') {
  const remoteUrls = [];
  const body = stripTags(html);

  for (const match of String(html).matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = match[1] || '';
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    if (!href) continue;
    const host = hostFromUrl(absolutize(href, 'https://example.invalid'));
    if (REMOTE_FONT_HOSTS.some((name) => host === name || host.endsWith(`.${name}`))) {
      remoteUrls.push(href);
    }
  }

  for (const match of body.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/gi)) {
    const url = match[1] || '';
    const host = hostFromUrl(absolutize(url, 'https://example.invalid'));
    if (REMOTE_FONT_HOSTS.some((name) => host === name || host.endsWith(`.${name}`))) {
      remoteUrls.push(url);
    }
  }

  for (const match of body.matchAll(/@font-face\s*\{([\s\S]*?)\}/gi)) {
    const block = match[1] || '';
    for (const src of block.matchAll(/url\((["']?)([^"')]+)\1\)/gi)) {
      const url = src[2] || '';
      if (url.startsWith('data:')) continue;
      const host = hostFromUrl(absolutize(url, 'https://example.invalid'));
      if (REMOTE_FONT_HOSTS.some((name) => host === name || host.endsWith(`.${name}`))) {
        remoteUrls.push(url);
      }
    }
  }

  const unique = [...new Set(remoteUrls)];
  const remoteHosts = [...new Set(unique.map((url) => hostFromUrl(absolutize(url, 'https://example.invalid'))).filter(Boolean))];
  return {
    remoteHosts,
    remoteUrls: unique.slice(0, 20)
  };
}

/**
 * @param {string} html
 * @param {{ origin?: string, privacyPaths?: string[] }} [options]
 */
export function analyzeCompliance(html = '', options = {}) {
  const origin = options.origin || '';
  const privacyPaths = Array.isArray(options.privacyPaths) && options.privacyPaths.length > 0
    ? options.privacyPaths
    : [...DEFAULT_PRIVACY_PATHS];

  const legal = analyzeLegalLinks(html, origin);
  const analytics = analyzeAnalytics(html);
  const cookieNotice = analyzeCookieNotice(html);
  const images = analyzeOnPageImages(html, origin);
  const fonts = analyzeRemoteFonts(html);

  return {
    legal: {
      ...legal,
      candidatePaths: privacyPaths
    },
    analytics,
    cookieNotice,
    images,
    fonts
  };
}

export function defaultPrivacyPaths() {
  return [...DEFAULT_PRIVACY_PATHS];
}

/**
 * Build summarize-friendly issues from a host compliance payload.
 * @param {object} compliance
 * @param {{ label?: string }} [options]
 */
export function complianceIssues(compliance = {}, options = {}) {
  const label = options.label || 'Production';
  const issues = [];
  const legal = compliance.legal || {};
  const page = compliance.legalPage || {};

  if (!legal.linked && !page.ok) {
    issues.push(`${label}: no legal/privacy link found in root HTML and no privacy/legal page responded OK.`);
  } else if (!legal.linked && page.ok) {
    issues.push(`${label}: privacy/legal page exists (${page.href || page.path}) but is not linked from root HTML.`);
  } else if (legal.linked && page.checked && !page.ok) {
    issues.push(`${label}: legal/privacy link present but page probe failed (${page.href || page.path}, status ${page.status || 'n/a'}).`);
  }

  const analytics = compliance.analytics || {};
  const cookieNotice = compliance.cookieNotice || {};
  if (analytics.detected && !cookieNotice.detected) {
    issues.push(
      `${label}: analytics detected (${(analytics.signals || []).join(', ') || 'unknown'}) but no cookies/consent notice was found in HTML.`
    );
  }

  const images = compliance.images || {};
  if ((images.legacyRaster || []).length > 0) {
    const sample = images.legacyRaster.slice(0, 3).map((entry) => entry.src).join(', ');
    issues.push(
      `${label}: ${images.legacyRaster.length} on-page image(s) still use JPG/PNG/GIF without WebP/AVIF/SVG (prefer modern formats). Sample: ${sample}`
    );
  }
  if ((images.missingDimensions || []).length > 0) {
    issues.push(
      `${label}: ${images.missingDimensions.length} on-page <img> tag(s) missing width/height (poor render / CLS risk).`
    );
  }

  const fonts = compliance.fonts || {};
  if ((fonts.remoteHosts || []).length > 0) {
    issues.push(
      `${label}: remote font CDN(s) detected — prefer self-hosted fonts: ${fonts.remoteHosts.join(', ')}`
    );
  }

  return issues;
}
