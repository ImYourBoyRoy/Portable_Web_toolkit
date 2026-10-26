// ./Web_Toolkit/discovery_doctor/src/validate.mjs
/**
 * Content validators for discovery-doctor.
 *
 * The validators are intentionally dependency-free, bounded, and explicit
 * about what is a web-standard requirement versus a toolkit warning.
 */

import { decodeXmlEntities, parseXmlDocument, xmlTextContent } from './xml.mjs';

const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const PRIVATE_PATH_SEGMENTS = new Set([
  'account',
  'accounts',
  'admin',
  'auth',
  'export',
  'private',
  'session',
  'sessions',
  'share',
  'shares',
  'sync',
  'user',
  'users',
]);
const SENSITIVE_QUERY_KEYS = /^(?:access[_-]?token|api[_-]?key|code|csrf|key|otp|password|secret|session|token)$/i;
const SECRET_VALUE_PATTERNS = [
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{20,}\b/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:api[_-]?key|access[_-]?token|secret|password|session[_-]?token)\s*[:=]\s*["'`]?[^\s"'`,]{8,}/i,
];

function cleanText(value = '') {
  return String(value || '').replace(/^\uFEFF/, '');
}

function firstNonBlankLine(lines = [], start = 0) {
  for (let index = start; index < lines.length; index += 1) {
    if (String(lines[index] || '').trim()) return index;
  }
  return -1;
}

function isHeading(line, level) {
  return new RegExp(`^\\s*#{${level}}\\s+\\S`).test(String(line || ''));
}

function isFence(line) {
  return /^\s*(```|~~~)/.test(String(line || ''));
}

function normalizeMarkdownHref(raw = '') {
  let value = String(raw || '').trim();
  if (value.startsWith('<')) {
    const close = value.indexOf('>');
    if (close > 0) value = value.slice(1, close);
  } else {
    value = value.split(/\s+/)[0] || '';
  }
  return value;
}

function replaceUrlTemplates(value = '') {
  const text = String(value || '');
  if ((text.match(/{/g) || []).length !== (text.match(/}/g) || []).length) return '';
  return text.replace(/\{[^{}]+\}/g, 'placeholder');
}

function hrefDetails(href = '', baseUrl = '') {
  const raw = normalizeMarkdownHref(href);
  const normalized = replaceUrlTemplates(raw);
  if (!raw || !normalized) return { raw, normalized, valid: false, reason: 'empty or unbalanced URL template' };
  if (/^(?:javascript|data|file):/i.test(normalized)) {
    return { raw, normalized, valid: false, reason: 'unsupported URL scheme' };
  }

  let url;
  try {
    url = new URL(normalized, baseUrl || 'https://discovery.invalid');
  } catch {
    return { raw, normalized, valid: false, reason: 'invalid URL' };
  }

  const relative = !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized);
  if (relative && !normalized.startsWith('/') && !normalized.startsWith('./') && !normalized.startsWith('../')) {
    return { raw, normalized, valid: false, reason: 'relative links must begin with /, ./, or ../' };
  }
  if (!relative && !HTTP_PROTOCOLS.has(url.protocol)) {
    return { raw, normalized, valid: false, reason: 'links must use http or https' };
  }
  if (url.username || url.password) {
    return { raw, normalized, valid: false, reason: 'URLs must not contain userinfo' };
  }

  return {
    raw,
    normalized,
    valid: true,
    url,
    hasTemplate: /\{[^{}]+\}/.test(raw),
    relative,
  };
}

function privatePath(pathname = '', privateSegments = PRIVATE_PATH_SEGMENTS) {
  let decoded = String(pathname || '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // An invalid escape is not a private path by itself; URL parsing has
    // already accepted the URL and the caller will still see the raw href.
  }
  const segments = decoded
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  return segments.some((segment) => privateSegments.has(segment));
}

function sensitiveQuery(url) {
  for (const [key, value] of url.searchParams.entries()) {
    if (SENSITIVE_QUERY_KEYS.test(key) && String(value).trim()) return true;
  }
  return false;
}

/**
 * Extract Markdown links outside fenced code blocks.
 * @returns {Array<{label: string, href: string, line: number}>}
 */
export function parseMarkdownLinks(text = '') {
  const links = [];
  let fenced = false;
  const lines = cleanText(text).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isFence(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    for (const match of String(line).matchAll(/!?(?:\[([^\]\n]+)\])\(([^)\n]+)\)/g)) {
      if (match[0].startsWith('!')) continue;
      links.push({ label: match[1].trim(), href: normalizeMarkdownHref(match[2]), line: index + 1 });
    }
  });
  return links;
}

/**
 * Validate the v2 llms.txt shape. H1 is the only mandatory part of the
 * emerging proposal; the blockquote and H2 link-list shape are warnings/errors
 * only where a document claims to use those sections.
 */
export function validateLlmsText(text = '', options = {}) {
  const source = cleanText(text);
  const lines = source.split(/\r?\n/);
  const kind = options.kind === 'full' ? 'full' : 'index';
  const errors = [];
  const warnings = [];
  const links = [];
  const h1Lines = [];
  const h2Sections = [];
  let fenced = false;

  if (!source.trim()) errors.push('file is empty');
  const first = firstNonBlankLine(lines);
  if (first < 0 || !isHeading(lines[first], 1)) errors.push('first non-blank line must be an H1');

  lines.forEach((line, index) => {
    if (isFence(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    if (isHeading(line, 1)) h1Lines.push({ line: index + 1, text: line.trim() });
    if (isHeading(line, 2)) h2Sections.push({ line: index + 1, text: line.trim(), start: index + 1 });
  });

  if (h1Lines.length > 1) errors.push(`file contains ${h1Lines.length} H1 headings; only one is allowed`);
  const h1Index = first >= 0 && isHeading(lines[first], 1) ? first : -1;
  if (h1Index >= 0) {
    const summaryIndex = firstNonBlankLine(lines, h1Index + 1);
    if (summaryIndex < 0 || !/^\s*>\s*\S/.test(lines[summaryIndex])) {
      warnings.push('add a blockquote summary immediately after the H1');
    }
  }

  for (let sectionIndex = 0; sectionIndex < h2Sections.length; sectionIndex += 1) {
    const section = h2Sections[sectionIndex];
    const end = sectionIndex + 1 < h2Sections.length ? h2Sections[sectionIndex + 1].start - 1 : lines.length;
    let sectionHasList = false;
    let sectionFenced = false;
    for (let lineIndex = section.start; lineIndex < end; lineIndex += 1) {
      const line = String(lines[lineIndex] || '');
      if (isFence(line)) {
        sectionFenced = !sectionFenced;
        continue;
      }
      if (sectionFenced || !line.trim()) continue;
      if (/^\s*[-*+]\s+/.test(line)) {
        sectionHasList = true;
        if (kind === 'index' && !/\[[^\]\n]+\]\(([^)\n]+)\)/.test(line)) {
          errors.push(`H2 section "${section.text.replace(/^##\s+/, '')}" line ${lineIndex + 1} must contain a Markdown link`);
        }
      } else if (kind === 'index') {
        errors.push(`H2 section "${section.text.replace(/^##\s+/, '')}" line ${lineIndex + 1} must be a Markdown link list`);
      }
    }
    if (!sectionHasList && kind === 'index') {
      warnings.push(`H2 section "${section.text.replace(/^##\s+/, '')}" has no link-list entries`);
    }
  }

  const privateSegments = new Set(
    Array.isArray(options.privatePathSegments) && options.privatePathSegments.length
      ? options.privatePathSegments.map((segment) => String(segment).toLowerCase())
      : PRIVATE_PATH_SEGMENTS,
  );
  for (const link of parseMarkdownLinks(source)) {
    const detail = hrefDetails(link.href, options.baseUrl || '');
    const record = { ...link, ...detail };
    links.push(record);
    if (!detail.valid) {
      errors.push(`line ${link.line} has ${detail.reason}: ${link.href}`);
      continue;
    }
    if (privatePath(detail.url.pathname, privateSegments)) {
      errors.push(`line ${link.line} links to a private-looking path: ${link.href}`);
    }
    if (sensitiveQuery(detail.url)) {
      errors.push(`line ${link.line} contains a sensitive query parameter: ${link.href}`);
    }
  }

  for (const pattern of SECRET_VALUE_PATTERNS) {
    if (pattern.test(source)) errors.push('file contains a credential-like value');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    links,
    h1: h1Lines[0]?.text || '',
    h2Sections: h2Sections.map((section) => section.text),
    hasSummary: h1Index >= 0 && (() => {
      const summaryIndex = firstNonBlankLine(lines, h1Index + 1);
      return summaryIndex >= 0 && /^\s*>\s*\S/.test(lines[summaryIndex]);
    })(),
    kind,
  };
}

function childElements(node, name = '') {
  return (node?.children || []).filter((child) => !name || child.name === name);
}

function validateAbsoluteHttpUrl(value) {
  try {
    const url = new URL(value);
    if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password || url.hash) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse and validate a sitemap or sitemap index instead of looking for a
 * substring that could occur inside HTML, a comment, or an error page.
 */
export function analyzeSitemapXml(text = '') {
  const parsed = parseXmlDocument(text, { maxBytes: 52 * 1024 * 1024 });
  if (!parsed.ok || !parsed.root) {
    return { ok: false, errors: parsed.errors, warnings: [], type: '', urls: [] };
  }

  const root = parsed.root;
  const errors = [];
  const warnings = [];
  if (!['urlset', 'sitemapindex'].includes(root.name)) {
    errors.push(`root element must be urlset or sitemapindex, found ${root.name}`);
  }
  if (root.attributes.xmlns !== SITEMAP_NAMESPACE) {
    errors.push(`root element must declare the sitemap namespace ${SITEMAP_NAMESPACE}`);
  }

  const entryName = root.name === 'sitemapindex' ? 'sitemap' : 'url';
  const entries = childElements(root);
  const urls = [];
  if (entries.length > 50000) errors.push('sitemap contains more than 50,000 entries');
  for (const entry of entries) {
    if (entry.name !== entryName) {
      errors.push(`${root.name} contains unexpected child element ${entry.name}`);
      continue;
    }
    const locs = childElements(entry, 'loc');
    if (locs.length !== 1) {
      errors.push(`${entryName} entry must contain exactly one loc element`);
      continue;
    }
    const loc = decodeXmlEntities(xmlTextContent(locs[0]).trim());
    if (!validateAbsoluteHttpUrl(loc)) errors.push(`invalid sitemap loc URL: ${loc}`);
    else urls.push(loc);
  }
  if (entries.length === 0) warnings.push('sitemap contains no entries');
  return { ok: errors.length === 0, errors, warnings, type: root.name, urls };
}

export function looksLikeSitemapXml(text = '') {
  return analyzeSitemapXml(text).ok;
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
  return analyzeRobots(text).sitemaps.length > 0;
}

export function robotsHasExactDisallowAll(text = '') {
  return analyzeRobots(text).blocksAll;
}

export function analyzeRobots(text = '') {
  const sitemaps = [];
  const disallow = [];
  const allow = [];
  const groups = [];
  let current = null;
  const lines = cleanText(text).split(/\r?\n/);
  for (const original of lines) {
    const line = original.replace(/#.*/, '').trim();
    if (!line) {
      if (current?.directives.length) current = null;
      continue;
    }
    const agentMatch = line.match(/^user-agent\s*:\s*(.+)$/i);
    if (agentMatch) {
      if (!current || current.directives.length) {
        current = { agents: [], disallow: [], allow: [], directives: [] };
        groups.push(current);
      }
      current.agents.push(agentMatch[1].trim().toLowerCase());
      continue;
    }
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const name = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (name === 'sitemap') sitemaps.push(value);
    if ((name === 'disallow' || name === 'allow') && !current) {
      current = { agents: ['*'], disallow: [], allow: [], directives: [] };
      groups.push(current);
    }
    if (name === 'disallow') {
      disallow.push(value);
      current?.disallow.push(value);
    }
    if (name === 'allow') {
      allow.push(value);
      current?.allow.push(value);
    }
    current?.directives.push({ name, value });
  }
  const wildcardGroups = groups.filter((group) => group.agents.includes('*'));
  const blocksAll = wildcardGroups.some((group) => group.disallow.includes('/') && !group.allow.includes('/'));
  const invalidSitemaps = sitemaps.filter((value) => !validateAbsoluteHttpUrl(value));
  return {
    sitemaps,
    invalidSitemaps,
    disallow,
    allow,
    groups,
    blocksAll,
    ok: invalidSitemaps.length === 0,
  };
}

function valuesForField(text, field) {
  const values = [];
  for (const line of cleanText(text).split(/\r?\n/)) {
    const match = line.match(new RegExp(`^\\s*${field}\\s*:\\s*(.+?)\\s*$`, 'i'));
    if (match) values.push(match[1]);
  }
  return values;
}

function isRfc3339(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function isAbsoluteUri(value) {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.hostname) || url.protocol === 'mailto:' || url.protocol === 'tel:';
  } catch {
    return false;
  }
}

export function validateSecurityTxt(text = '') {
  const errors = [];
  const warnings = [];
  const contact = valuesForField(text, 'Contact');
  const expires = valuesForField(text, 'Expires');
  const policy = valuesForField(text, 'Policy');
  const canonical = valuesForField(text, 'Canonical');

  if (contact.length === 0) errors.push('Contact field is required');
  for (const value of contact) {
    if (!/^(?:mailto:|tel:|https:)/i.test(value) || !isAbsoluteUri(value)) {
      errors.push(`Contact is not an absolute mailto, tel, or https URI: ${value}`);
    }
  }
  if (expires.length !== 1) errors.push('exactly one Expires field is required');
  if (expires.length === 1) {
    if (!isRfc3339(expires[0])) errors.push(`Expires is not RFC 3339 date-time: ${expires[0]}`);
    else if (Number.isNaN(Date.parse(expires[0]))) errors.push(`Expires is not a real date-time: ${expires[0]}`);
    else if (Date.parse(expires[0]) <= Date.now()) errors.push('Expires is in the past');
  }
  for (const value of [...policy, ...canonical]) {
    if (!isAbsoluteUri(value)) errors.push(`security.txt URI field is invalid: ${value}`);
  }
  if (expires.length === 1 && isRfc3339(expires[0])) {
    const days = (Date.parse(expires[0]) - Date.now()) / (1000 * 60 * 60 * 24);
    if (days > 366) warnings.push('Expires is more than one year in the future');
  }

  return { ok: errors.length === 0, errors, warnings, fields: { contact, expires, policy, canonical } };
}

export function contentType(headers = {}) {
  if (headers && typeof headers.get === 'function') return String(headers.get('content-type') || '');
  return String(headers?.['content-type'] || headers?.['Content-Type'] || '');
}

export function contentTypeMatches(headers, allowed = []) {
  const actual = contentType(headers).split(';')[0].trim().toLowerCase();
  if (!actual) return { ok: true, actual, missing: true };
  return {
    ok: allowed.some((value) => {
      const expected = String(value).toLowerCase();
      if (expected === actual) return true;
      if (expected.endsWith('/*') && actual.startsWith(expected.slice(0, -1))) return true;
      if (expected.includes('*') && actual.startsWith(expected.split('*')[0]) && actual.endsWith(expected.split('*').at(-1))) return true;
      return false;
    }),
    actual,
    missing: false,
  };
}

/**
 * @param {string} html
 * @returns {{ hasJsonLd: boolean, validJsonLd: number, malformedJsonLd: number, types: string[], hasWebIdentity: boolean, hasBreadcrumb: boolean }}
 */
export function analyzeJsonLd(html = '') {
  const types = new Set();
  let hasJsonLd = false;
  let validJsonLd = 0;
  let malformedJsonLd = 0;
  for (const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    hasJsonLd = true;
    const raw = match[1] || '';
    try {
      const parsed = JSON.parse(raw);
      validJsonLd += 1;
      collectTypes(parsed, types);
    } catch {
      malformedJsonLd += 1;
    }
  }
  const list = [...types];
  return {
    hasJsonLd,
    validJsonLd,
    malformedJsonLd,
    types: list,
    hasWebIdentity: list.some((t) => ['WebSite', 'Organization', 'Person'].includes(t)),
    hasBreadcrumb: list.includes('BreadcrumbList'),
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
  for (const value of Object.values(node)) collectTypes(value, types);
}

export function findFileInBuild(distPath, itemPath, fs, path) {
  const cleanPath = String(itemPath).split('?')[0];
  const candidates = [
    path.join(distPath, cleanPath),
    path.join(distPath, 'client', cleanPath),
  ];
  if (!cleanPath.includes('.')) {
    candidates.push(
      path.join(distPath, cleanPath, 'index.html'),
      path.join(distPath, 'client', cleanPath, 'index.html'),
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
