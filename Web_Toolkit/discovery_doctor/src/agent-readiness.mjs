/**
 * Agent-readiness validators for discovery-doctor.
 *
 * Dependency-free, bounded analyzers for the discovery surfaces that AI agents and search engines read beyond the
 * classic files: RFC 9727 API catalogs, Markdown twins and Accept negotiation, RFC 8288 Link headers, MCP server
 * cards, AI crawler policy in robots.txt (including Content-Signal), and sitemap/canonical agreement.
 * Every analyzer returns `{ ok, errors, warnings, ... }`; callers decide how absence is reported (info by default,
 * failure when the site policy marks the surface required).
 */

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

/** Crawlers whose robots.txt groups indicate a deliberate AI policy. */
export const KNOWN_AI_AGENTS = [
  'gptbot', 'oai-searchbot', 'chatgpt-user',
  'claudebot', 'claude-webcrawler', 'claude-searchbot', 'claude-user', 'anthropic-ai',
  'google-extended', 'google-cloudvertexbot',
  'perplexitybot', 'perplexity-user',
  'applebot-extended', 'meta-externalagent', 'meta-externalfetcher',
  'ccbot', 'bytespider', 'amazonbot', 'duckassistbot', 'mistralai-user', 'cohere-ai', 'youbot', 'diffbot',
];

const CONTENT_SIGNAL_KEYS = ['search', 'ai-input', 'ai-train'];

function isAbsoluteHttp(value) {
  try {
    return HTTP_PROTOCOLS.has(new URL(String(value)).protocol);
  } catch {
    return false;
  }
}

/** Parse an RFC 8288 Link header value into `{ href, rel: string[], type }` entries. */
export function parseLinkHeader(value = '') {
  const links = [];
  const text = String(value || '');
  const pattern = /<([^>]*)>((?:\s*;\s*[a-zA-Z*-]+(?:\s*=\s*(?:"[^"]*"|[^\s;,]+))?)*)/g;
  let match;
  while ((match = pattern.exec(text))) {
    const params = {};
    for (const param of match[2].matchAll(/;\s*([a-zA-Z*-]+)(?:\s*=\s*(?:"([^"]*)"|([^\s;,]+)))?/g)) {
      params[param[1].toLowerCase()] = param[2] ?? param[3] ?? '';
    }
    links.push({
      href: match[1].trim(),
      rel: String(params.rel || '').toLowerCase().split(/\s+/).filter(Boolean),
      type: params.type ? String(params.type).toLowerCase() : '',
    });
  }
  return links;
}

/** Which agent-discovery relations a Link header declares. */
export function summarizeLinkHeader(value = '') {
  const links = parseLinkHeader(value);
  return {
    links,
    hasApiCatalog: links.some((link) => link.rel.includes('api-catalog')),
    hasMarkdownAlternate: links.some((link) => link.rel.includes('alternate') && link.type === 'text/markdown'),
    hasCanonical: links.some((link) => link.rel.includes('canonical')),
    hasDescribedBy: links.some((link) => link.rel.includes('describedby') || link.rel.includes('service-desc')),
    malformed: String(value || '').trim() !== '' && links.length === 0,
  };
}

/** Parse a Cloudflare/Netlify style `_headers` file into `[{ pattern, headers: [[name, value]] }]`. */
export function parseHeadersFile(text = '') {
  const rules = [];
  let current = null;
  for (const line of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s/.test(line)) {
      const separator = line.indexOf(':');
      if (!current || separator < 1) continue;
      current.headers.push([line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()]);
    } else {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
    }
  }
  return rules;
}

const patternMatches = (pattern, pathname) => {
  if (pattern === pathname) return true;
  if (!pattern.includes('*') && !pattern.includes(':')) return false;
  const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:[a-zA-Z_]+/g, '[^/]+');
  return new RegExp(`^${source}$`).test(pathname);
};

/** Headers a path receives from a `_headers` file (later duplicate names are joined with a comma, as Cloudflare does). */
export function headersForPath(rules, pathname) {
  const merged = {};
  for (const rule of rules) {
    if (!patternMatches(rule.pattern, pathname)) continue;
    for (const [name, value] of rule.headers) merged[name] = merged[name] ? `${merged[name]}, ${value}` : value;
  }
  return merged;
}

/** Validate an RFC 9727 API catalog (an RFC 9264 linkset). */
export function analyzeApiCatalog(text = '') {
  const errors = [];
  const warnings = [];
  let data;
  try {
    data = JSON.parse(String(text));
  } catch {
    return { ok: false, errors: ['api-catalog is not valid JSON'], warnings, entries: 0, apis: 0 };
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.linkset)) {
    return { ok: false, errors: ['api-catalog must be a JSON object with a "linkset" array (RFC 9264)'], warnings, entries: 0, apis: 0 };
  }
  let apis = 0;
  data.linkset.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') { errors.push(`linkset[${index}] must be an object`); return; }
    if (!isAbsoluteHttp(entry.anchor)) errors.push(`linkset[${index}] needs an absolute http(s) "anchor"`);
    for (const [relation, targets] of Object.entries(entry)) {
      if (relation === 'anchor') continue;
      if (!Array.isArray(targets)) { errors.push(`linkset[${index}].${relation} must be an array of link objects`); continue; }
      for (const target of targets) {
        if (!target || typeof target.href !== 'string' || !target.href) errors.push(`linkset[${index}].${relation} has a target without "href"`);
      }
    }
    if (entry['service-desc'] || entry['service-doc']) apis += 1;
  });
  if (data.linkset.length === 0) warnings.push('api-catalog lists no APIs');
  else if (apis === 0) warnings.push('no entry has a service-desc or service-doc link, so agents cannot find API descriptions');
  return { ok: errors.length === 0, errors, warnings, entries: data.linkset.length, apis };
}

/** Validate an MCP server card (/.well-known/mcp/server-card.json). Same-origin remotes can be probed by the caller. */
export function analyzeServerCard(text = '', { origin = '' } = {}) {
  const errors = [];
  const warnings = [];
  let data;
  try {
    data = JSON.parse(String(text));
  } catch {
    return { ok: false, errors: ['server card is not valid JSON'], warnings, remotes: [], tools: [] };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['server card must be a JSON object'], warnings, remotes: [], tools: [] };
  }
  if (!data.name || typeof data.name !== 'string') errors.push('server card needs a "name"');
  if (!data.description) warnings.push('server card has no description');
  const remotes = Array.isArray(data.remotes) ? data.remotes : [];
  if (remotes.length === 0 && !data.url) errors.push('server card needs "remotes" (or "url") with the MCP endpoint');
  const urls = [];
  for (const remote of remotes) {
    if (!remote || !isAbsoluteHttp(remote.url)) { errors.push('every remote needs an absolute http(s) "url"'); continue; }
    urls.push(remote.url);
    if (origin && new URL(remote.url).origin !== origin) warnings.push(`remote ${remote.url} is not on ${origin}`);
  }
  if (data.url && isAbsoluteHttp(data.url)) urls.push(data.url);
  const tools = Array.isArray(data.tools) ? data.tools : [];
  return { ok: errors.length === 0, errors, warnings, remotes: [...new Set(urls)], tools };
}

/** Extract the AI policy declared in robots.txt: Content-Signal values, named AI crawler groups, and rule mismatches. */
export function analyzeAiPolicy(robotsText = '') {
  const warnings = [];
  const groups = [];
  let current = null;
  for (const original of String(robotsText).replace(/^﻿/, '').split(/\r?\n/)) {
    const line = original.replace(/#.*/, '').trim();
    if (!line) { if (current?.rules.length) current = null; continue; }
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const name = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (name === 'user-agent') {
      if (!current || current.rules.length) { current = { agents: [], rules: [], signals: {}, disallow: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue;
    current.rules.push(name);
    if (name === 'disallow') current.disallow.push(value);
    if (name === 'content-signal') {
      for (const part of value.split(',')) {
        const [key, setting] = part.split('=').map((piece) => piece.trim().toLowerCase());
        if (CONTENT_SIGNAL_KEYS.includes(key) && ['yes', 'no'].includes(setting)) current.signals[key] = setting;
        else if (key) warnings.push(`unrecognized Content-Signal "${part.trim()}"`);
      }
    }
  }

  const wildcard = groups.filter((group) => group.agents.includes('*'));
  const signals = Object.assign({}, ...wildcard.map((group) => group.signals));
  const named = groups.flatMap((group) => group.agents.filter((agent) => KNOWN_AI_AGENTS.includes(agent)).map((agent) => ({ agent, group })));
  const agents = [...new Set(named.map((entry) => entry.agent))];
  const blocked = [...new Set(named.filter(({ group }) => group.disallow.includes('/')).map((entry) => entry.agent))];

  // A crawler that matches its own group ignores `*`, so wildcard Disallow rules must be repeated there.
  const wildcardDisallow = [...new Set(wildcard.flatMap((group) => group.disallow).filter((value) => value && value !== '/'))];
  const missingRules = [...new Set(named.filter(({ group }) => wildcardDisallow.some((rule) => !group.disallow.includes(rule))).map((entry) => entry.agent))];
  if (missingRules.length) warnings.push(`named crawler groups ignore the "*" group, so these omit its Disallow rules: ${missingRules.slice(0, 5).join(', ')}${missingRules.length > 5 ? ', ...' : ''}`);

  const declared = Object.keys(signals).length > 0 || agents.length > 0;
  return {
    ok: true,
    errors: [],
    warnings,
    declared,
    signals,
    agents,
    blocked,
    missingContentSignal: declared && Object.keys(signals).length === 0,
  };
}

/** Compare a sitemap URL with the page's canonical link. */
export function compareCanonical(loc, html = '') {
  const tag = String(html).match(/<link\b[^>]*\brel=["']?canonical["']?[^>]*>/i)?.[0] || '';
  const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
  if (!href) return { ok: false, reason: 'missing canonical link', canonical: '' };
  let canonical;
  try { canonical = new URL(href, loc).href; } catch { return { ok: false, reason: 'invalid canonical URL', canonical: href }; }
  if (canonical === loc) return { ok: true, canonical };
  const trailingSlashOnly = canonical.replace(/\/$/, '') === loc.replace(/\/$/, '');
  return { ok: false, reason: trailingSlashOnly ? 'trailing slash differs' : 'canonical differs', canonical };
}

/** Sanity-check a Markdown twin body. */
export function analyzeMarkdownTwin(text = '', { canonical = '' } = {}) {
  const errors = [];
  const warnings = [];
  const body = String(text).replace(/^﻿/, '');
  if (body.trim().length < 80) errors.push('Markdown twin is empty or nearly empty');
  if (/<(?:html|body|script|div|section)\b/i.test(body.replace(/```[\s\S]*?```/g, ''))) errors.push('Markdown twin contains raw HTML');
  if (!/^#\s+\S/m.test(body)) warnings.push('Markdown twin has no top-level heading');
  if (canonical && !body.includes(canonical)) warnings.push('Markdown twin does not mention its canonical URL');
  return { ok: errors.length === 0, errors, warnings };
}

/** Pathname candidates for a page's twin: `/about/` -> `/about/index.md`, `/about` -> `/about.md`. */
export function markdownTwinPaths(pathname) {
  const clean = pathname === '' ? '/' : pathname;
  return clean.endsWith('/') ? [`${clean}index.md`] : [`${clean}.md`, `${clean}/index.md`];
}
