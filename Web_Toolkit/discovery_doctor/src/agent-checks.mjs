/**
 * Agent-readiness checks for discovery-doctor (local build trees and live sites).
 *
 * Compatibility contract (so the doctor stays safe to run on every site):
 *   - A surface that is absent is INFO, never a failure, unless the policy marks it required
 *     (`required.apiCatalog`, `markdownTwins`, `linkHeaders`, `mcpServerCard`, `aiPolicy`, `canonicalConsistency`).
 *   - A surface that is present but malformed is a FAILURE.
 *   - A surface that is present but incomplete (some pages covered, not all) is a WARNING.
 *   - Sitemap/canonical disagreement is a WARNING unless `required.canonicalConsistency` is true.
 * Live checks send only GET requests, sample at most `agentSampleSize` pages, and never call MCP tools.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fetchPublicText } from '../../shared/lib/url-safety.mjs';
import {
  analyzeAiPolicy,
  analyzeApiCatalog,
  analyzeMarkdownTwin,
  analyzeServerCard,
  compareCanonical,
  headersForPath,
  markdownTwinPaths,
  parseHeadersFile,
  summarizeLinkHeader,
} from './agent-readiness.mjs';
import { checkMcpEndpoint } from './live.mjs';
import { addResult } from './report.mjs';
import { analyzeSitemapXml, contentTypeMatches, findFileInBuild, findFirstExisting } from './validate.mjs';

const CATALOG_PATH = '/.well-known/api-catalog';
const SERVER_CARD_PATHS = ['/.well-known/mcp/server-card.json', '/.well-known/mcp.json'];
const MAX_LOCAL_PAGES = 300;
const DEFAULT_SAMPLE = 12;

const absentStatus = (policy, key) => (policy.required?.[key] ? 'fail' : 'info');
const absentDetail = (policy, key, detail) => (policy.required?.[key] ? `required by the active discovery policy: ${detail}` : `optional and not present: ${detail}`);
const sampleOf = (items, size) => {
  if (items.length <= size) return items;
  const step = (items.length - 1) / (size - 1);
  return Array.from({ length: size }, (_, index) => items[Math.round(index * step)]);
};
const examples = (values, limit = 3) => `${values.slice(0, limit).join('; ')}${values.length > limit ? `; +${values.length - limit} more` : ''}`;

function localSitemapUrls(distPath, policy) {
  const found = findFirstExisting(distPath, policy.sitemapCandidates, fs, path);
  if (!found) return [];
  const sitemap = analyzeSitemapXml(fs.readFileSync(found.found, 'utf8'));
  return sitemap.ok && sitemap.type === 'urlset' ? sitemap.urls : [];
}

function reportCanonical(report, policy, stats) {
  const label = 'Sitemap/canonical agreement';
  if (stats.checked === 0) {
    addResult(report, 'info', label, 'no sitemap pages could be read to compare');
    return;
  }
  if (stats.problems.length === 0) {
    addResult(report, 'pass', label, `${stats.checked} page(s): every canonical link equals its sitemap URL`);
    return;
  }
  addResult(report, policy.required?.canonicalConsistency ? 'fail' : 'warn', label, `${stats.problems.length} of ${stats.checked} page(s) disagree (${examples(stats.problems)})`);
}

function reportTwins(report, policy, stats, urls) {
  const label = 'Markdown twins';
  if (stats.found === 0) {
    addResult(report, absentStatus(policy, 'markdownTwins'), label, absentDetail(policy, 'markdownTwins', `no <page>/index.md or <page>.md for ${urls} sitemap page(s)`));
    return;
  }
  if (stats.problems.length) addResult(report, 'fail', label, examples(stats.problems));
  else if (stats.missing.length) addResult(report, 'warn', label, `${stats.found} of ${stats.total} page(s) have a twin; missing: ${examples(stats.missing)}`);
  else addResult(report, 'pass', label, `${stats.found} of ${stats.total} page(s) have a valid Markdown twin`);
  for (const warning of stats.warnings.slice(0, 3)) addResult(report, 'warn', label, warning);
}

function reportAiPolicy(report, policy, robotsBody, hasAiTxt) {
  const label = 'AI crawler policy';
  if (robotsBody === null) {
    addResult(report, absentStatus(policy, 'aiPolicy'), label, absentDetail(policy, 'aiPolicy', 'robots.txt is missing'));
    return;
  }
  const ai = analyzeAiPolicy(robotsBody);
  if (!ai.declared) {
    addResult(report, absentStatus(policy, 'aiPolicy'), label, absentDetail(policy, 'aiPolicy', 'robots.txt names no AI crawlers and sets no Content-Signal (crawlers fall back to the "*" group)'));
  } else {
    const signals = Object.entries(ai.signals).map(([key, value]) => `${key}=${value}`).join(', ') || 'no Content-Signal';
    const blocked = ai.blocked.length ? `; blocks ${ai.blocked.join(', ')}` : '';
    addResult(report, 'pass', label, `${ai.agents.length} AI crawler group(s) named; ${signals}${blocked}${hasAiTxt ? '; ai.txt present' : ''}`);
    if (ai.missingContentSignal) addResult(report, 'info', label, 'consider a Content-Signal directive (search, ai-input, ai-train) to state training and retrieval intent explicitly');
  }
  for (const warning of ai.warnings) addResult(report, 'warn', label, warning);
}

function headerCoverage(rules, pathnames) {
  let withCatalog = 0;
  let withMarkdown = 0;
  let withVary = 0;
  let malformed = 0;
  for (const pathname of pathnames) {
    const headers = headersForPath(rules, pathname);
    const summary = summarizeLinkHeader(headers.link);
    if (summary.hasApiCatalog) withCatalog += 1;
    if (summary.hasMarkdownAlternate) { withMarkdown += 1; if (/\baccept\b/i.test(headers.vary || '')) withVary += 1; }
    if (summary.malformed) malformed += 1;
  }
  return { withCatalog, withMarkdown, withVary, malformed, total: pathnames.length };
}

function reportLinkHeaders(report, policy, coverage) {
  const label = 'Link headers (RFC 8288)';
  if (coverage.total === 0) { addResult(report, 'info', label, 'no sitemap pages to evaluate'); return; }
  if (coverage.malformed) { addResult(report, 'fail', label, `${coverage.malformed} page(s) carry a Link header that cannot be parsed`); return; }
  if (coverage.withCatalog === 0 && coverage.withMarkdown === 0) {
    addResult(report, absentStatus(policy, 'linkHeaders'), label, absentDetail(policy, 'linkHeaders', 'no page declares rel=api-catalog or a text/markdown alternate'));
    return;
  }
  const gaps = [];
  if (coverage.withCatalog < coverage.total) gaps.push(`rel=api-catalog on ${coverage.withCatalog}/${coverage.total}`);
  if (coverage.withMarkdown < coverage.total) gaps.push(`markdown alternate on ${coverage.withMarkdown}/${coverage.total}`);
  if (coverage.withVary < coverage.withMarkdown) gaps.push(`Vary: Accept on ${coverage.withVary}/${coverage.withMarkdown} negotiated pages`);
  if (gaps.length) addResult(report, 'warn', label, gaps.join('; '));
  else addResult(report, 'pass', label, `${coverage.total} page(s) declare api-catalog and markdown alternate links with Vary: Accept`);
}

/** Local build tree. */
export function checkAgentReadinessLocal(distPath, report, policy) {
  const urls = localSitemapUrls(distPath, policy);
  const pages = urls.slice(0, MAX_LOCAL_PAGES).map((loc) => ({ loc, pathname: new URL(loc).pathname }));

  // 1. Sitemap URLs versus canonical links.
  const canonical = { checked: 0, problems: [] };
  for (const page of pages) {
    const file = findFileInBuild(distPath, page.pathname, fs, path);
    if (!file || !file.endsWith('.html')) continue;
    canonical.checked += 1;
    const result = compareCanonical(page.loc, fs.readFileSync(file, 'utf8'));
    if (!result.ok) canonical.problems.push(`${page.pathname}: ${result.reason}${result.canonical ? ` (${result.canonical})` : ''}`);
  }
  reportCanonical(report, policy, canonical);

  // 2. Markdown twins.
  const twins = { found: 0, total: pages.length, missing: [], problems: [], warnings: [] };
  for (const page of pages) {
    const twinFile = markdownTwinPaths(page.pathname).map((candidate) => findFileInBuild(distPath, candidate, fs, path)).find(Boolean);
    if (!twinFile) { twins.missing.push(page.pathname); continue; }
    twins.found += 1;
    if (twins.found <= 40) {
      const result = analyzeMarkdownTwin(fs.readFileSync(twinFile, 'utf8'), { canonical: page.loc });
      twins.problems.push(...result.errors.map((error) => `${page.pathname}: ${error}`));
      twins.warnings.push(...result.warnings.map((warning) => `${page.pathname}: ${warning}`));
    }
  }
  reportTwins(report, policy, twins, pages.length);

  // 3. Link headers from _headers.
  const headersFile = ['_headers', 'client/_headers'].map((name) => path.join(distPath, name)).find((file) => fs.existsSync(file));
  const rules = headersFile ? parseHeadersFile(fs.readFileSync(headersFile, 'utf8')) : [];
  reportLinkHeaders(report, policy, headerCoverage(rules, pages.map((page) => page.pathname)));

  // 4. API catalog.
  const catalogFile = findFileInBuild(distPath, CATALOG_PATH, fs, path);
  if (!catalogFile) addResult(report, absentStatus(policy, 'apiCatalog'), 'API catalog (RFC 9727)', absentDetail(policy, 'apiCatalog', CATALOG_PATH));
  else {
    const catalog = analyzeApiCatalog(fs.readFileSync(catalogFile, 'utf8'));
    if (!catalog.ok) addResult(report, 'fail', 'API catalog (RFC 9727)', catalog.errors.join('; '));
    else addResult(report, 'pass', 'API catalog (RFC 9727)', `${catalog.entries} linkset entr${catalog.entries === 1 ? 'y' : 'ies'}, ${catalog.apis} with a description`);
    for (const warning of catalog.warnings) addResult(report, 'warn', 'API catalog (RFC 9727)', warning);
    const type = headersForPath(rules, CATALOG_PATH)['content-type'] || '';
    if (!/application\/linkset\+json/i.test(type)) addResult(report, 'warn', 'API catalog (RFC 9727)', `serve ${CATALOG_PATH} as application/linkset+json (add a _headers rule or set it in the Worker)`);
  }

  // 5. MCP server card.
  const cardFile = SERVER_CARD_PATHS.map((candidate) => findFileInBuild(distPath, candidate, fs, path)).find(Boolean);
  if (!cardFile) addResult(report, absentStatus(policy, 'mcpServerCard'), 'MCP server card', absentDetail(policy, 'mcpServerCard', SERVER_CARD_PATHS.join(' or ')));
  else {
    const card = analyzeServerCard(fs.readFileSync(cardFile, 'utf8'));
    if (!card.ok) addResult(report, 'fail', 'MCP server card', card.errors.join('; '));
    else addResult(report, 'pass', 'MCP server card', `${card.remotes.length} remote(s), ${card.tools.length} tool(s) listed; probe the endpoint on the live URL`);
    for (const warning of card.warnings) addResult(report, 'warn', 'MCP server card', warning);
  }

  // 6. AI policy.
  const robotsFile = findFileInBuild(distPath, '/robots.txt', fs, path);
  reportAiPolicy(report, policy, robotsFile ? fs.readFileSync(robotsFile, 'utf8') : null, Boolean(findFileInBuild(distPath, '/ai.txt', fs, path)));
}

/** Live site. `fetchText` defaults to the SSRF-guarded helper; tests inject their own. */
export async function checkAgentReadinessLive(baseUrl, report, policy, options = {}) {
  const fetchText = options.fetchText || ((url, init = {}) => fetchPublicText(url, {
    label: init.label || 'agent-readiness',
    timeoutMs: policy.timeoutMs,
    allowLoopback: policy.allowLoopback,
    fetchOptions: init.fetchOptions,
  }));
  const get = async (pathname, accept) => {
    try {
      return await fetchText(new URL(pathname, baseUrl).href, {
        label: pathname,
        fetchOptions: { method: 'GET', headers: accept ? { Accept: accept } : {}, redirect: 'follow' },
      });
    } catch (error) {
      return { ok: false, status: 0, body: '', headers: {}, error: error instanceof Error ? error.message : String(error) };
    }
  };
  const sameOrigin = (result) => {
    try { return new URL(result.url || baseUrl).origin === new URL(baseUrl).origin; } catch { return false; }
  };

  // Sitemap pages to sample.
  let urls = [];
  for (const candidate of policy.sitemapCandidates) {
    const result = await get(candidate);
    if (!result.ok || !sameOrigin(result)) continue;
    const sitemap = analyzeSitemapXml(result.body);
    if (sitemap.ok && sitemap.type === 'urlset') { urls = sitemap.urls; break; }
  }
  // A loopback run serves a production build whose absolute URLs name the real domain: fetch by path from the local
  // server and compare against the advertised URL. Otherwise only same-origin pages are sampled.
  const sample = sampleOf(urls, Math.max(1, Number(policy.agentSampleSize) || DEFAULT_SAMPLE))
    .filter((loc) => policy.allowLoopback || new URL(loc).origin === new URL(baseUrl).origin);

  const canonical = { checked: 0, problems: [] };
  const coverageRules = [];
  const twins = { found: 0, total: sample.length, missing: [], problems: [], warnings: [] };
  let negotiated = 0;
  let negotiatedVary = 0;
  let linkCatalog = 0;
  let linkMarkdown = 0;
  let linkMalformed = 0;

  for (const loc of sample) {
    const pathname = new URL(loc).pathname;
    const html = await get(pathname, 'text/html');
    if (html.ok && /html/i.test(html.headers?.['content-type'] || 'html')) {
      canonical.checked += 1;
      const result = compareCanonical(loc, html.body);
      if (!result.ok) canonical.problems.push(`${pathname}: ${result.reason}${result.canonical ? ` (${result.canonical})` : ''}`);
      const link = summarizeLinkHeader(html.headers?.link);
      if (link.hasApiCatalog) linkCatalog += 1;
      if (link.hasMarkdownAlternate) linkMarkdown += 1;
      if (link.malformed) linkMalformed += 1;
      coverageRules.push(pathname);
    }

    let twin = null;
    for (const candidate of markdownTwinPaths(pathname)) {
      const result = await get(candidate);
      if (result.ok && /markdown/i.test(result.headers?.['content-type'] || '')) { twin = result; break; }
    }
    if (!twin) twins.missing.push(pathname);
    else {
      twins.found += 1;
      const analysis = analyzeMarkdownTwin(twin.body, { canonical: loc });
      twins.problems.push(...analysis.errors.map((error) => `${pathname}: ${error}`));
      twins.warnings.push(...analysis.warnings.map((warning) => `${pathname}: ${warning}`));
    }

    if (twin) {
      const markdown = await get(pathname, 'text/markdown');
      if (markdown.ok && /markdown/i.test(markdown.headers?.['content-type'] || '')) {
        negotiated += 1;
        if (/\baccept\b/i.test(markdown.headers?.vary || '')) negotiatedVary += 1;
      }
    }
  }

  reportCanonical(report, policy, canonical);
  reportTwins(report, policy, twins, sample.length);

  if (twins.found > 0) {
    const label = 'Accept: text/markdown negotiation';
    if (negotiated === 0) addResult(report, 'info', label, 'pages answer HTML to Accept: text/markdown (twins are reachable at their own URLs)');
    else if (negotiated < twins.found) addResult(report, 'warn', label, `${negotiated} of ${twins.found} page(s) with twins negotiate`);
    else if (negotiatedVary < negotiated) addResult(report, 'warn', label, `negotiated responses on ${negotiated - negotiatedVary} page(s) omit Vary: Accept, so caches can serve the wrong form`);
    else addResult(report, 'pass', label, `${negotiated} page(s) answer text/markdown with Vary: Accept`);
  }

  reportLinkHeaders(report, policy, {
    total: canonical.checked, withCatalog: linkCatalog, withMarkdown: linkMarkdown, withVary: linkMarkdown, malformed: linkMalformed,
  });

  // API catalog.
  const catalog = await get(CATALOG_PATH, 'application/linkset+json');
  if (!catalog.ok) addResult(report, absentStatus(policy, 'apiCatalog'), 'API catalog (RFC 9727)', absentDetail(policy, 'apiCatalog', `${CATALOG_PATH} returned HTTP ${catalog.status || 'error'}`));
  else {
    const analysis = analyzeApiCatalog(catalog.body);
    if (!analysis.ok) addResult(report, 'fail', 'API catalog (RFC 9727)', analysis.errors.join('; '));
    else addResult(report, 'pass', 'API catalog (RFC 9727)', `${analysis.entries} linkset entr${analysis.entries === 1 ? 'y' : 'ies'}, ${analysis.apis} with a description`);
    for (const warning of analysis.warnings) addResult(report, 'warn', 'API catalog (RFC 9727)', warning);
    const type = contentTypeMatches(catalog.headers, ['application/linkset+json']);
    if (!type.ok && !type.missing) addResult(report, 'warn', 'API catalog (RFC 9727)', `Content-Type is ${type.actual}; RFC 9727 expects application/linkset+json`);
  }

  // MCP server card and its endpoint.
  let card = null;
  for (const candidate of SERVER_CARD_PATHS) {
    const result = await get(candidate);
    if (result.ok) { card = result; break; }
  }
  if (!card) addResult(report, absentStatus(policy, 'mcpServerCard'), 'MCP server card', absentDetail(policy, 'mcpServerCard', SERVER_CARD_PATHS.join(' or ')));
  else {
    const analysis = analyzeServerCard(card.body, { origin: policy.allowLoopback ? '' : new URL(baseUrl).origin });
    if (!analysis.ok) addResult(report, 'fail', 'MCP server card', analysis.errors.join('; '));
    else addResult(report, 'pass', 'MCP server card', `${analysis.remotes.length} remote(s), ${analysis.tools.length} tool(s) listed`);
    for (const warning of analysis.warnings) addResult(report, 'warn', 'MCP server card', warning);
    if (analysis.ok) {
      const remotes = analysis.remotes
        .map((url) => (policy.allowLoopback ? new URL(new URL(url).pathname, baseUrl).href : url))
        .filter((url) => new URL(url).origin === new URL(baseUrl).origin);
      for (const remote of remotes) {
        const probe = await (options.probeMcp || checkMcpEndpoint)(remote, {
          protocolVersion: policy.mcpProtocolVersion,
          timeoutMs: policy.timeoutMs,
          allowLoopback: policy.allowLoopback,
        });
        if (probe.ok) addResult(report, 'pass', 'MCP server card endpoint', `${probe.era} discovery + lists OK (${probe.tools.length} tools)`);
        else addResult(report, 'fail', 'MCP server card endpoint', probe.errors.join('; '));
        for (const warning of probe.warnings) addResult(report, 'warn', 'MCP server card endpoint', warning);
      }
    }
  }

  // AI policy.
  const robots = await get('/robots.txt');
  const aiTxt = await get('/ai.txt');
  reportAiPolicy(report, policy, robots.ok ? robots.body : null, aiTxt.ok);
}
