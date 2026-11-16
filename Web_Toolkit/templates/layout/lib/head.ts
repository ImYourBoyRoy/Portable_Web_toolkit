// ./src/lib/head.ts
/**
 * Pure helpers behind BaseHead.astro: title formatting, canonical and absolute URLs, indexing rules, icon links and
 * the social-card model. Erasable TypeScript only (no enums, parameter properties or namespaces) so Node can import
 * it directly in tests. canonicalPagePath, markdownPathFor and isIndexableHost mirror templates/discovery/lib/site.ts;
 * layout.test.mjs asserts they stay in step.
 */

export const PLACEHOLDER_TWITTER = '@yourhandle';
export const ROBOTS_INDEX = 'index, follow, max-image-preview:large';
export const ROBOTS_NOINDEX = 'noindex, nofollow';

export interface IconLink {
  rel: string;
  href: string;
  type?: string;
  sizes?: string;
}

export interface IconConfig {
  /** SVG master, e.g. /favicon.svg. Empty string or false disables it. */
  svg?: string | false;
  /** Optional legacy /favicon.ico (browsers request it anyway, so ship the file before enabling). */
  ico?: string | false;
  /** 180x180 PNG for iOS home screens. */
  apple?: string | false;
  /** Web app manifest. */
  manifest?: string | false;
}

export interface SeoInput {
  siteName: string;
  titleTemplate?: string;
  title?: string;
  description?: string;
  /** Production origin without a trailing slash; usually Astro.site. Empty means "emit root-relative URLs". */
  origin?: string;
  /** Astro.url.pathname. */
  pathname: string;
  /** Override: absolute URL or path. */
  canonical?: string;
  ogImage?: string;
  ogImageAlt?: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
  ogType?: 'website' | 'article' | 'profile';
  locale?: string;
  twitterSite?: string;
  assetVersion?: string;
  publishedTime?: string;
  modifiedTime?: string;
  /** Emit rel=alternate links to the Markdown twin and llms.txt (only on indexable pages). */
  markdownAlternate?: boolean;
  llmsPath?: string;
  noindex?: boolean;
  robots?: string;
  /** PUBLIC_SITE_ENV: anything other than "production" (when set) means noindex. */
  siteEnv?: string;
  /** Build-time hostname of the production site (Astro.site.hostname). */
  hostname?: string;
  /** import.meta.env.PROD, used only when there is no hostname. */
  isProd?: boolean;
}

export interface SeoModel {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  indexable: boolean;
  indexReason: string;
  ogType: string;
  ogLocale: string;
  ogSiteName: string;
  ogImage: string;
  ogImageAlt: string;
  ogImageType: string;
  ogImageWidth: number | undefined;
  ogImageHeight: number | undefined;
  twitterCard: 'summary_large_image' | 'summary';
  twitterSite: string;
  publishedTime: string;
  modifiedTime: string;
  markdownHref: string;
  llmsHref: string;
}

export function collapseWhitespace(text: string | undefined | null): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * "About" -> "About | Site Name". The home page (no title, or title equal to the site name) is just the site name, and a
 * title that already contains the site name is not branded twice. Template tokens: %s (page title), %site (site name).
 */
export function formatTitle(title: string | undefined, siteName: string, template = '%s | %site'): string {
  const name = collapseWhitespace(siteName);
  const page = collapseWhitespace(title);
  if (!page) return name;
  if (!name || page.toLowerCase() === name.toLowerCase()) return page || name;
  if (page.toLowerCase().includes(name.toLowerCase())) return page;
  return template.replace(/%site|%s/g, (token) => (token === '%site' ? name : page));
}

export function stripQueryAndHash(path: string): string {
  return String(path ?? '').replace(/[?#].*$/, '');
}

/** Mirrors discovery canonicalPagePath: pages end with a slash; files, /api/ and /.well-known/ keep their form. */
export function canonicalPagePath(path: string): string {
  if (!path || path === '/') return '/';
  if (/[?#{]/.test(path) || path.endsWith('/')) return path;
  if (path.startsWith('/api/') || path.startsWith('/.well-known/') || /\.[a-z0-9]+$/i.test(path)) return path;
  return `${path}/`;
}

/** Mirrors discovery markdownPathFor: `/about/` -> `/about/index.md`. */
export function markdownPathFor(path: string): string {
  const page = canonicalPagePath(path);
  return `${page.endsWith('/') ? page : `${page}/`}index.md`;
}

/** Origin without a trailing slash, or '' when the value is not a usable absolute URL. */
export function normalizeOrigin(value: string | URL | undefined | null): string {
  if (!value) return '';
  const text = value.toString().replace(/\/+$/, '');
  try {
    new URL(text);
    return text;
  } catch {
    return '';
  }
}

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/** Resolve a path against the origin; absolute URLs pass through, protocol-relative ones get https. No slash is added. */
export function absoluteUrl(origin: string, value: string): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (ABSOLUTE.test(text)) return text;
  if (text.startsWith('//')) return `https:${text}`;
  if (!origin) return text;
  return new URL(text, `${origin}/`).href;
}

/** Absolute canonical URL for a pathname: query and hash dropped, trailing-slash convention applied. */
export function buildCanonicalUrl(origin: string, pathname: string): string {
  const path = canonicalPagePath(stripQueryAndHash(pathname) || '/');
  return origin ? new URL(path, `${origin}/`).href : path;
}

/** Append ?v=<stamp> (or &v=) so unhashed public/ assets bust caches on each build. */
export function withVersion(url: string, version: string | undefined): string {
  if (!url || !version) return url;
  const hashIndex = url.indexOf('#');
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const cleaned = base.replace(/([?&])v=[^&]*&?/, '$1').replace(/[?&]$/, '');
  return `${cleaned}${cleaned.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}${hash}`;
}

/** Mirrors discovery isIndexableHost. */
export function isIndexableHost(hostname: string): boolean {
  const lower = String(hostname ?? '').toLowerCase();
  if (!lower) return false;
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) return false;
  if (lower.includes('workers.dev') || lower.includes('pages.dev')) return false;
  if (lower.startsWith('dev.') || lower.startsWith('staging.') || lower.startsWith('preview.')) return false;
  return true;
}

/** example.com style hosts mean site.json was never filled in; never index those. */
export function isPlaceholderHost(hostname: string): boolean {
  const lower = String(hostname ?? '').toLowerCase();
  return /(^|\.)example\.(com|org|net)$/.test(lower) || /\.(test|invalid|example)$/.test(lower);
}

/**
 * Decide indexing. Precedence: explicit `robots` string > `noindex` prop > PUBLIC_SITE_ENV (set and not "production")
 * > placeholder or non-production hostname > PROD flag when no hostname is known.
 */
export function resolveIndexing(input: Pick<SeoInput, 'noindex' | 'robots' | 'siteEnv' | 'hostname' | 'isProd'>): {
  indexable: boolean;
  robots: string;
  reason: string;
} {
  const no = (reason: string) => ({ indexable: false, robots: ROBOTS_NOINDEX, reason });
  const robots = collapseWhitespace(input.robots);
  if (robots) return { indexable: !/noindex/i.test(robots), robots, reason: 'robots prop' };
  if (input.noindex) return no('noindex prop');
  const env = collapseWhitespace(input.siteEnv).toLowerCase();
  if (env && env !== 'production') return no(`PUBLIC_SITE_ENV=${env}`);
  const host = collapseWhitespace(input.hostname);
  if (host) {
    if (isPlaceholderHost(host)) return no('placeholder host');
    if (!isIndexableHost(host)) return no('non-production host');
    return { indexable: true, robots: ROBOTS_INDEX, reason: 'production host' };
  }
  return input.isProd ? { indexable: true, robots: ROBOTS_INDEX, reason: 'production build' } : no('non-production build');
}

/** "@Handle" -> "@Handle"; "handle" -> "@handle"; the placeholder and invalid values -> ''. */
export function normalizeTwitterHandle(handle: string | undefined): string {
  const text = collapseWhitespace(handle);
  if (!text || text.toLowerCase() === PLACEHOLDER_TWITTER) return '';
  const withAt = text.startsWith('@') ? text : `@${text}`;
  return /^@\w{1,15}$/.test(withAt) ? withAt : '';
}

/** "en_US" -> "en-US" for <html lang>. */
export function langFromLocale(locale: string | undefined): string {
  const text = collapseWhitespace(locale).replace(/_/g, '-');
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(text) ? text : 'en';
}

/** "en-US" -> "en_US" for og:locale. */
export function ogLocaleFrom(locale: string | undefined): string {
  const text = collapseWhitespace(locale).replace(/-/g, '_');
  return /^[a-z]{2,3}(_[A-Za-z0-9]{2,8})?$/.test(text) ? text : 'en_US';
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};

/** MIME type for og:image:type. SVG is deliberately absent: social crawlers do not render it. */
export function imageMimeType(url: string): string {
  const match = stripQueryAndHash(url).match(/\.([a-z0-9]+)$/i);
  return (match && IMAGE_TYPES[match[1].toLowerCase()]) || '';
}

/** Favicon, apple-touch and manifest links; each can be overridden or disabled. No stock placeholder files. */
export function resolveIcons(config: IconConfig = {}, version?: string): IconLink[] {
  const defaults: Required<IconConfig> = {
    svg: '/favicon.svg',
    ico: false,
    apple: '/apple-touch-icon.png',
    manifest: '/manifest.webmanifest',
  };
  const pick = (key: keyof IconConfig) => {
    const value = config[key] === undefined ? defaults[key] : config[key];
    return value ? withVersion(String(value), version) : '';
  };
  const links: IconLink[] = [];
  const svg = pick('svg');
  const ico = pick('ico');
  const apple = pick('apple');
  const manifest = pick('manifest');
  if (ico) links.push({ rel: 'icon', href: ico, sizes: '32x32' });
  if (svg) links.push({ rel: 'icon', href: svg, type: 'image/svg+xml', sizes: 'any' });
  if (apple) links.push({ rel: 'apple-touch-icon', href: apple, sizes: '180x180' });
  if (manifest) links.push({ rel: 'manifest', href: manifest });
  return links;
}

/** Everything BaseHead renders, as plain data. */
export function buildSeo(input: SeoInput): SeoModel {
  const origin = normalizeOrigin(input.origin);
  const siteName = collapseWhitespace(input.siteName);
  const title = formatTitle(input.title, siteName, input.titleTemplate);
  const description = collapseWhitespace(input.description);
  const canonical = input.canonical
    ? absoluteUrl(origin, input.canonical.startsWith('/') ? canonicalPagePath(input.canonical) : input.canonical)
    : buildCanonicalUrl(origin, input.pathname);
  const indexing = resolveIndexing(input);
  const image = input.ogImage ? withVersion(absoluteUrl(origin, input.ogImage), input.assetVersion) : '';
  const handle = normalizeTwitterHandle(input.twitterSite);
  const markdown = Boolean(input.markdownAlternate) && indexing.indexable;
  const pagePath = canonicalPagePath(stripQueryAndHash(input.pathname) || '/');
  const hasSize = Boolean(input.ogImageWidth && input.ogImageHeight);
  return {
    title,
    description,
    canonical,
    robots: indexing.robots,
    indexable: indexing.indexable,
    indexReason: indexing.reason,
    ogType: input.ogType ?? 'website',
    ogLocale: ogLocaleFrom(input.locale),
    ogSiteName: siteName,
    ogImage: image,
    ogImageAlt: collapseWhitespace(input.ogImageAlt),
    ogImageType: image ? imageMimeType(image) : '',
    ogImageWidth: image && hasSize ? input.ogImageWidth : undefined,
    ogImageHeight: image && hasSize ? input.ogImageHeight : undefined,
    twitterCard: image ? 'summary_large_image' : 'summary',
    twitterSite: handle,
    publishedTime: collapseWhitespace(input.publishedTime),
    modifiedTime: collapseWhitespace(input.modifiedTime),
    markdownHref: markdown ? absoluteUrl(origin, markdownPathFor(pagePath)) : '',
    llmsHref: markdown && input.llmsPath ? absoluteUrl(origin, input.llmsPath) : '',
  };
}
