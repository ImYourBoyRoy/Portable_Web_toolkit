// ./src/lib/nav.ts
/**
 * Pure helpers behind SiteHeader, SiteFooter and Breadcrumbs: tolerant parsing of src/data/nav.json and footer.json,
 * current-page matching, default breadcrumb trails and the BreadcrumbList node. Erasable TypeScript only.
 */
import { absoluteUrl, canonicalPagePath, stripQueryAndHash } from './head.ts';

export type CurrentState = 'page' | 'section' | null;

export interface NavLink {
  label: string;
  href: string;
  description?: string;
  external?: boolean;
}

export interface NavItem {
  label: string;
  /** Optional when the item only opens a submenu. */
  href?: string;
  external?: boolean;
  /** One level only; deeper levels are dropped. */
  children?: NavLink[];
}

export interface NavBrand {
  name?: string;
  href: string;
  logo?: string;
  logoWidth: number;
  logoHeight: number;
  showName: boolean;
}

export interface NavConfig {
  brand: NavBrand;
  items: NavItem[];
  cta?: NavLink;
}

export interface ResolvedNavLink extends NavLink {
  current: CurrentState;
}

export interface ResolvedNavItem extends Omit<NavItem, 'children'> {
  current: CurrentState;
  children: ResolvedNavLink[];
}

export interface FooterColumn {
  title: string;
  links: NavLink[];
}

export interface FooterConfig {
  tagline: string;
  columns: FooterColumn[];
  social: NavLink[];
  legal: NavLink[];
  copyright: { holder: string; text: string; startYear?: number };
}

export interface Crumb {
  label: string;
  href: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** http(s), protocol-relative, mailto: and tel: links are not "this site". */
export function isExternalHref(href: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(String(href ?? '').trim());
}

/** Only web links open in a new tab; mailto: and tel: stay in place. */
export function opensNewTab(href: string): boolean {
  return /^(?:https?:)?\/\//i.test(String(href ?? '').trim());
}

/** Compare-ready path: query/hash and a trailing index.html dropped, slash convention applied. */
export function normalizePath(path: string): string {
  const clean = stripQueryAndHash(String(path ?? '')).replace(/\/{2,}/g, '/').replace(/index\.html$/i, '');
  const rooted = clean.startsWith('/') ? clean : `/${clean}`;
  return canonicalPagePath(rooted);
}

/**
 * 'page' when href is exactly the current page (aria-current="page"); 'section' when the current page is below href
 * (styling hint only, never announced); null otherwise. Anchors (/#faq), external links and mailto: never match.
 */
export function matchCurrent(href: string | undefined, pathname: string): CurrentState {
  const target = String(href ?? '').trim();
  if (!target || target.startsWith('#') || target.includes('#') || isExternalHref(target)) return null;
  const link = normalizePath(target);
  const here = normalizePath(pathname);
  if (link === here) return 'page';
  if (link !== '/' && link.endsWith('/') && here.startsWith(link)) return 'section';
  return null;
}

function parseLink(raw: unknown): NavLink | null {
  if (!isRecord(raw)) return null;
  const label = text(raw.label);
  const href = text(raw.href);
  if (!label || !href) return null;
  const link: NavLink = { label, href };
  const description = text(raw.description);
  if (description) link.description = description;
  if (raw.external === true || isExternalHref(href)) link.external = true;
  return link;
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Tolerant parse of nav.json: invalid entries are dropped, never thrown on, so one typo cannot break every page. */
export function parseNavConfig(raw: unknown): NavConfig {
  const source = isRecord(raw) ? raw : {};
  const brandRaw = isRecord(source.brand) ? source.brand : {};
  const items: NavItem[] = [];
  for (const entry of Array.isArray(source.items) ? source.items : []) {
    if (!isRecord(entry)) continue;
    const label = text(entry.label);
    if (!label) continue;
    const children = (Array.isArray(entry.children) ? entry.children : [])
      .map(parseLink)
      .filter((link): link is NavLink => link !== null);
    const href = text(entry.href);
    if (!href && !children.length) continue;
    const item: NavItem = { label };
    if (href) item.href = href;
    if (entry.external === true || (href && isExternalHref(href))) item.external = true;
    if (children.length) item.children = children;
    items.push(item);
  }
  const brand: NavBrand = {
    href: text(brandRaw.href) || '/',
    logoWidth: positive(brandRaw.logoWidth, 40),
    logoHeight: positive(brandRaw.logoHeight, 40),
    showName: brandRaw.showName !== false,
  };
  const name = text(brandRaw.name);
  const logo = text(brandRaw.logo);
  if (name) brand.name = name;
  if (logo) brand.logo = logo;
  const cta = parseLink(source.cta);
  return cta ? { brand, items, cta } : { brand, items };
}

/** Mark each item/child with its current state; a parent is 'section' when one of its children is the current page. */
export function resolveNav(items: NavItem[], pathname: string): ResolvedNavItem[] {
  return items.map((item) => {
    const children = (item.children ?? []).map((child) => ({ ...child, current: matchCurrent(child.href, pathname) }));
    let current = matchCurrent(item.href, pathname);
    if (current !== 'page' && children.some((child) => child.current !== null)) current = 'section';
    const { children: _drop, ...rest } = item;
    return { ...rest, current, children };
  });
}

/** Tolerant parse of footer.json. */
export function parseFooterConfig(raw: unknown): FooterConfig {
  const source = isRecord(raw) ? raw : {};
  const links = (value: unknown): NavLink[] =>
    (Array.isArray(value) ? value : []).map(parseLink).filter((link): link is NavLink => link !== null);
  const columns: FooterColumn[] = [];
  for (const entry of Array.isArray(source.columns) ? source.columns : []) {
    if (!isRecord(entry)) continue;
    const title = text(entry.title);
    const list = links(entry.links);
    if (title && list.length) columns.push({ title, links: list });
  }
  const copyright = isRecord(source.copyright) ? source.copyright : {};
  const startYear = typeof copyright.startYear === 'number' && Number.isInteger(copyright.startYear) ? copyright.startYear : undefined;
  return {
    tagline: text(source.tagline),
    columns,
    social: links(source.social),
    legal: links(source.legal),
    copyright: {
      holder: text(copyright.holder),
      text: text(copyright.text) || 'All rights reserved.',
      ...(startYear ? { startYear } : {}),
    },
  };
}

/** "2024-2026" when startYear is earlier than the build year, otherwise just the build year. */
export function copyrightYears(startYear: number | undefined, now: Date = new Date()): string {
  const year = now.getFullYear();
  return startYear && startYear < year ? `${startYear}–${year}` : String(year);
}

function titleCase(slug: string): string {
  let words = slug;
  try {
    words = decodeURIComponent(slug);
  } catch {
    /* keep the raw segment */
  }
  words = words.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Default trail from the URL: Home > Blog > Post Title. `labels` maps a canonical path ("/blog/") to a real label;
 * use it, or pass explicit items, whenever the slug is not a good label.
 */
export function breadcrumbsFromPath(pathname: string, options: { homeLabel?: string; labels?: Record<string, string> } = {}): Crumb[] {
  const homeLabel = options.homeLabel || 'Home';
  const labels = options.labels ?? {};
  const segments = normalizePath(pathname).split('/').filter(Boolean);
  const trail: Crumb[] = [{ label: homeLabel, href: '/' }];
  segments.forEach((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join('/')}/`;
    trail.push({ label: labels[href] || titleCase(segment), href });
  });
  return trail;
}

/**
 * BreadcrumbList node using the same @id Schema.astro uses (`<pageUrl>#breadcrumb`). Two script blocks that carry the
 * same @id describe one node, so this refines Schema's path-derived labels instead of duplicating them.
 */
export function breadcrumbListNode(items: Crumb[], origin: string, pageUrl: string): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: absoluteUrl(origin, isExternalHref(item.href) ? item.href : canonicalPagePath(stripQueryAndHash(item.href) || '/')),
    })),
  };
}
