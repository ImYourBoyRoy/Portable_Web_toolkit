#!/usr/bin/env node
// ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs
/**
 * Discovery Doctor — standards-aware discovery posture auditor.
 *
 * The doctor validates what exists, applies the toolkit's core discovery
 * contract by default, and reads site-specific expectations from a discovery
 * policy or site profile. Profiles may explicitly relax core artifacts or add
 * public API/MCP requirements; any artifact that is present but malformed is
 * still a failure.
 *
 * Usage:
 *   discovery-doctor <url|dist_path> [flags]
 *
 * Exit codes:
 *   0 — no failures (warnings allowed unless --strict)
 *   1 — usage / invalid target
 *   2 — one or more check failures
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolvePortableRoot } from '../../shared/lib/context.mjs';
import { parseCliArgs } from '../../shared/lib/cli.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { assertPublicHttpUrl, fetchPublicText } from '../../shared/lib/url-safety.mjs';
import { auditDistTree } from '../../headers_deploy/src/lib/audit-lib.mjs';
import { addResult, createReport, exitCodeForReport } from '../src/report.mjs';
import { checkAgentReadinessLive, checkAgentReadinessLocal } from '../src/agent-checks.mjs';
import { checkDiscoveryLinks, checkMcpEndpoint } from '../src/live.mjs';
import { createDiscoveryPolicy } from '../src/policy.mjs';
import {
  analyzeJsonLd,
  analyzeRobots,
  analyzeSitemapXml,
  contentTypeMatches,
  findFileInBuild,
  findFirstExisting,
  looksLikeJson,
  validateLlmsText,
  validateSecurityTxt,
} from '../src/validate.mjs';

resolvePortableRoot(import.meta.url, 2);

function parseArgs(argv) {
  const { command, flags } = parseCliArgs(argv, {
    booleanFlags: ['require-llms', 'require-llms-full', 'skip-link-checks', 'allow-loopback']
  });
  return { positionals: command, flags };
}

function printHelp() {
  return printStandardHelp({
    name: 'discovery-doctor',
    summary: 'Audit discovery files, APIs, and AI-readable endpoints',
    usage: [
      'discovery-doctor <url|dist_path> [--site-profile <profile>] [--policy <json>]',
      'discovery-doctor <url|dist_path> [--environment production|development] [--strict]'
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Read discovery settings from profile.discovery or profile.diagnostics.discovery.' },
      { name: '--policy <path>', description: 'Read a standalone discovery policy JSON file.' },
      { name: '--environment <name>', description: 'Apply production or development default requirements.' },
      { name: '--strict', description: 'Treat warnings as failures for exit status.' },
      { name: '--require-llms', description: 'Force /llms.txt to be required for this run.' },
      { name: '--require-llms-full', description: 'Force /llms-full.txt to be required for this run.' },
      { name: '--skip-link-checks', description: 'Skip same-origin links advertised by llms.txt.' },
      { name: '--allow-loopback', description: 'Permit a localhost/127.0.0.1 target for testing a local Worker or preview server. Private LAN and metadata hosts stay blocked.' },
      { name: '--json', description: 'Write a machine-readable report to stdout.' }
    ],
    examples: [
      'discovery-doctor ./dist --json',
      'discovery-doctor https://example.com --site-profile ./site.site-profile.json --json',
      'discovery-doctor ./dist --policy ./discovery-policy.json --strict',
      'discovery-doctor http://127.0.0.1:8788 --allow-loopback --site-profile ./site.site-profile.json'
    ],
    notes: [
      'Read-only audit; live checks fetch public same-origin resources and do not send credentials or call MCP tools.',
      'Agent-readiness checks (API catalog, Markdown twins, Link headers, MCP server card, AI crawler policy, sitemap/canonical agreement) report absent surfaces as INFO unless the policy marks them required.',
      'Production requires core discovery artifacts by default; a site profile or policy may explicitly relax requirements.',
      'With --json, stdout contains one JSON object with schemaVersion, target, counts, results, and exitCode.'
    ],
    exitCodes: [
      { name: '0', description: 'No failures (warnings allowed unless --strict).' },
      { name: '1', description: 'Usage error or missing target.' },
      { name: '2', description: 'Check failure, or strict-mode warning.' }
    ]
  });
}

function readJsonFile(filePath, label) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) throw new Error(`${label} not found: ${resolved}`);
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function loadPolicy(flags) {
  const profile = flags['site-profile'] ? readJsonFile(String(flags['site-profile']), 'Site profile') : null;
  const standalone = flags.policy ? readJsonFile(String(flags.policy), 'Discovery policy') : null;
  const source = standalone || profile || {};
  return createDiscoveryPolicy(source, {
    environment: flags.environment,
    requireLlms: Boolean(flags['require-llms']),
    requireLlmsFull: Boolean(flags['require-llms-full']),
    checkLinks: flags['skip-link-checks'] ? false : undefined,
    allowLoopback: Boolean(flags['allow-loopback']),
  });
}

function formatName(format) {
  return String(format || 'text').trim().toLowerCase();
}

function expectedContentTypes(format) {
  switch (formatName(format)) {
    case 'json':
      return ['application/json', 'application/*+json'];
    case 'xml':
    case 'sitemap':
      return ['application/xml', 'text/xml', 'application/*+xml'];
    case 'html':
      return ['text/html', 'application/xhtml+xml'];
    case 'text':
    case 'llms':
    case 'security':
    case 'robots':
    case 'humans':
    default:
      return ['text/plain', 'text/markdown', 'text/*'];
  }
}

function contentTypeDetail(result, format) {
  const type = contentTypeMatches(result.headers, expectedContentTypes(format));
  if (type.missing) return { status: 'warn', detail: 'response omitted Content-Type' };
  if (!type.ok) return { status: 'fail', detail: `unexpected Content-Type ${type.actual}` };
  return null;
}

function reportValidation(report, label, validation, foundDetail = 'Found') {
  for (const warning of validation.warnings || []) addResult(report, 'warn', label, warning);
  if (validation.ok) {
    addResult(report, 'pass', label, foundDetail);
    return true;
  }
  addResult(report, 'fail', label, validation.errors.join('; '));
  return false;
}

function validateBody(item, body, options = {}) {
  const format = formatName(item.format);
  if (format === 'json') {
    if (!looksLikeJson(body)) return { ok: false, errors: ['present but not valid JSON'], warnings: [] };
    try {
      const value = JSON.parse(body);
      if (item.schema === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) {
        return { ok: false, errors: ['JSON response must be an object'], warnings: [] };
      }
      if (item.schema === 'array' && !Array.isArray(value)) {
        return { ok: false, errors: ['JSON response must be an array'], warnings: [] };
      }
      if (item.schema === 'envelope') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return { ok: false, errors: ['JSON response envelope must be an object'], warnings: [] };
        }
        if (value.ok !== true) return { ok: false, errors: ['JSON response envelope must have ok: true'], warnings: [] };
        if (!Object.prototype.hasOwnProperty.call(value, 'data')) return { ok: false, errors: ['JSON response envelope must contain data'], warnings: [] };
        if (value.meta !== undefined && (!value.meta || typeof value.meta !== 'object' || Array.isArray(value.meta))) {
          return { ok: false, errors: ['JSON response envelope meta must be an object'], warnings: [] };
        }
        if (value.warnings !== undefined && !Array.isArray(value.warnings)) {
          return { ok: false, errors: ['JSON response envelope warnings must be an array'], warnings: [] };
        }
      }
    } catch {
      return { ok: false, errors: ['present but not valid JSON'], warnings: [] };
    }
    return { ok: true, errors: [], warnings: [] };
  }
  if (format === 'llms') return validateLlmsText(body, {
    kind: options.kind || 'index',
    baseUrl: options.baseUrl || '',
    privatePathSegments: options.privatePathSegments,
  });
  if (format === 'security') return validateSecurityTxt(body);
  if (format === 'robots') return analyzeRobots(body);
  if (format === 'sitemap' || format === 'xml') return analyzeSitemapXml(body);
  return { ok: true, errors: [], warnings: [] };
}

function resourceItems(policy) {
  return [
    { path: '/robots.txt', label: 'Robots Policy', format: 'robots', required: policy.required.robots },
    { path: '/llms.txt', label: 'AI Context (llms.txt)', format: 'llms', kind: 'index', required: policy.required.llms },
    { path: '/llms-full.txt', label: 'Full AI Context (llms-full.txt)', format: 'llms', kind: 'full', required: policy.required.llmsFull },
    { path: '/humans.txt', label: 'Humans.txt', format: 'humans', required: policy.required.humans },
    { path: '/.well-known/security.txt', label: 'Security.txt (RFC 9116)', format: 'security', required: policy.required.securityTxt },
    ...policy.endpoints,
  ];
}

function missingStatus(item, local = false) {
  if (local && item.runtimeOnly) return 'info';
  return item.required ? 'fail' : 'info';
}

function missingDetail(item, local = false) {
  if (local && item.runtimeOnly) return 'runtime-only; verify on the live URL';
  return item.required ? 'required by the active discovery policy' : 'optional and not present';
}

function logPolicy(policy) {
  if (policy.quiet) return;
  const state = (value) => value ? 'required' : 'optional';
  console.log([
    `Policy: environment=${policy.environment}`,
    `sitemap=${state(policy.required.sitemap)}`,
    `llms=${state(policy.required.llms)}`,
    `llms-full=${state(policy.required.llmsFull)}`,
    `humans=${state(policy.required.humans)}`,
    `security=${state(policy.required.securityTxt)}`,
    `content-api=${state(policy.required.contentApi)}`,
    `search-api=${state(policy.required.searchApi)}`,
    `links=${policy.checkLinks ? 'on' : 'off'}`,
  ].join(', '));
}

function sameOriginPath(value, baseUrl) {
  try {
    return new URL(value, baseUrl).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function responseStayedOnOrigin(result, baseUrl) {
  return sameOriginPath(result?.url || baseUrl, baseUrl);
}

async function checkLiveResource(baseUrl, item, report, policy, linkSources) {
  if (!sameOriginPath(item.path, baseUrl)) {
    addResult(report, 'fail', item.label, 'policy endpoint must be same-origin; external endpoints are not fetched');
    return;
  }
  const fullUrl = new URL(item.path, baseUrl).href;
  try {
    if (formatName(item.format) === 'mcp' || item.method === 'POST') {
      if (formatName(item.format) !== 'mcp') {
        addResult(report, 'info', item.label, 'POST endpoint is policy-declared; no generic POST schema validator is configured');
        return;
      }
      const mcp = await checkMcpEndpoint(fullUrl, { protocolVersion: item.protocolVersion || policy.mcpProtocolVersion, allowLoopback: policy.allowLoopback });
      if (mcp.ok) addResult(report, 'pass', item.label, `MCP ${mcp.era} discovery + lists OK (${mcp.tools.length} tools)`);
      else if (!item.required && /HTTP (?:404|405)\b/.test(mcp.errors.join('; '))) addResult(report, 'info', item.label, 'optional MCP endpoint is not present');
      else addResult(report, 'fail', item.label, mcp.errors.join('; '));
      for (const warning of mcp.warnings) addResult(report, 'warn', item.label, warning);
      return;
    }

    const result = await fetchPublicText(fullUrl, { label: item.label, timeoutMs: policy.timeoutMs, allowLoopback: policy.allowLoopback });
    if (!responseStayedOnOrigin(result, baseUrl)) {
      addResult(report, 'fail', item.label, `redirected off origin to ${result.url}`);
      return;
    }
    if (!result.ok) {
      const missing = result.status === 404 || result.status === 410;
      addResult(report, missing ? (item.required ? 'fail' : 'info') : 'fail', item.label, missing
        ? `HTTP ${result.status} — ${item.required ? 'required' : 'optional'} resource`
        : `HTTP ${result.status} — advertised endpoint failed`);
      return;
    }
    const typeResult = contentTypeDetail(result, item.format);
    if (typeResult?.status === 'fail') {
      addResult(report, 'fail', item.label, typeResult.detail);
      return;
    }
    if (typeResult?.status === 'warn') addResult(report, 'warn', item.label, typeResult.detail);

    const validation = validateBody(item, result.body, {
      kind: item.kind,
      baseUrl,
      privatePathSegments: policy.privatePathSegments,
    });
    if (item.format === 'robots') {
      if (policy.environment !== 'production' && !validation.blocksAll) {
        addResult(report, 'fail', item.label, 'development policy requires Disallow: /');
      } else if (policy.environment === 'production' && validation.blocksAll) {
        addResult(report, 'fail', item.label, 'production policy must not Disallow: / for all crawlers');
      } else if (validation.invalidSitemaps?.length) {
        addResult(report, 'fail', item.label, `invalid Sitemap URL(s): ${validation.invalidSitemaps.join(', ')}`);
      } else if (policy.environment === 'production' && !validation.sitemaps.length) {
        addResult(report, 'warn', item.label, 'no Sitemap: directive');
      } else {
        addResult(report, 'pass', item.label, `HTTP ${result.status}`);
      }
    } else {
      const passed = reportValidation(report, item.label, validation, `HTTP ${result.status}`);
      if (passed && validation.links?.length) linkSources.push(...validation.links);
    }
  } catch (error) {
    addResult(report, item.required ? 'fail' : 'info', item.label, `Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkLiveSitemap(baseUrl, policy, report) {
  const invalid = [];
  for (const candidate of policy.sitemapCandidates) {
    if (!sameOriginPath(candidate, baseUrl)) {
      invalid.push(`${candidate}: policy candidate must be same-origin`);
      continue;
    }
    const fullUrl = new URL(candidate, baseUrl).href;
    try {
      const result = await fetchPublicText(fullUrl, { label: 'sitemap', timeoutMs: policy.timeoutMs, maxBytes: 52 * 1024 * 1024, allowLoopback: policy.allowLoopback });
      if (!responseStayedOnOrigin(result, baseUrl)) {
        invalid.push(`${candidate}: redirected off origin to ${result.url}`);
        continue;
      }
      if (!result.ok) continue;
      const typeResult = contentTypeDetail({ headers: result.headers }, 'sitemap');
      if (typeResult?.status === 'fail') addResult(report, 'warn', 'Vision-Ready Sitemap', `${candidate}: ${typeResult.detail}`);
      const validation = analyzeSitemapXml(result.body);
      if (validation.ok) {
        for (const warning of validation.warnings) addResult(report, 'warn', 'Vision-Ready Sitemap', `${candidate}: ${warning}`);
        addResult(report, 'pass', 'Vision-Ready Sitemap', `Found ${candidate} (${result.status}; ${validation.urls.length} entries)`);
        return true;
      }
      invalid.push(`${candidate}: ${validation.errors.join('; ')}`);
    } catch (error) {
      invalid.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (policy.required.sitemap) addResult(report, 'fail', 'Vision-Ready Sitemap', invalid.join(' | ') || `missing (${policy.sitemapCandidates.join(' or ')})`);
  else addResult(report, 'info', 'Vision-Ready Sitemap', invalid.join(' | ') || `optional and not present (${policy.sitemapCandidates.join(' or ')})`);
  return false;
}

async function checkLive(baseUrl, report, policy) {
  if (!report.quiet) {
    console.log(`\nDiscovery Doctor: live posture at ${baseUrl}`);
    console.log('--------------------------------------------------');
  }
  logPolicy({ ...policy, quiet: report.quiet });
  await checkLiveSitemap(baseUrl, policy, report);

  const linkSources = [];
  for (const item of resourceItems(policy)) await checkLiveResource(baseUrl, item, report, policy, linkSources);

  try {
    const result = await fetchPublicText(baseUrl, { label: 'homepage', timeoutMs: policy.timeoutMs, allowLoopback: policy.allowLoopback });
    if (!responseStayedOnOrigin(result, baseUrl)) throw new Error(`homepage redirected off origin to ${result.url}`);
    if (!result.ok) throw new Error(`HTTP ${result.status}`);
    const jsonLd = analyzeJsonLd(result.body || '');
    if (!jsonLd.hasJsonLd) {
      addResult(report, policy.required.jsonLd ? 'fail' : 'info', 'Structured Data (JSON-LD)', 'Missing');
    } else if (jsonLd.malformedJsonLd > 0) {
      addResult(report, 'fail', 'Structured Data (JSON-LD)', `${jsonLd.malformedJsonLd} JSON-LD script(s) are malformed`);
    } else if (!jsonLd.hasWebIdentity) {
      addResult(report, 'fail', 'Structured Data (JSON-LD)', 'Valid script found but missing WebSite/Organization/Person');
    } else {
      addResult(report, 'pass', 'Structured Data (JSON-LD)', `Found (${jsonLd.types.join(', ') || 'types present'})`);
    }
    if (jsonLd.hasBreadcrumb) addResult(report, 'pass', 'Breadcrumb Schema', 'Found');
    else addResult(report, 'warn', 'Breadcrumb Schema', 'Not on homepage (OK if nested routes use it)');
  } catch (error) {
    addResult(report, policy.required.jsonLd ? 'fail' : 'info', 'Structured Data (JSON-LD)', `Error: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (policy.checkLinks && linkSources.length) {
    const linkReport = await checkDiscoveryLinks({
      baseUrl,
      links: linkSources,
      policy,
      maxLinks: policy.maxLinks,
      allowLoopback: policy.allowLoopback,
      skipPaths: resourceItems(policy).map((item) => {
        try {
          const url = new URL(item.path, baseUrl);
          return `${url.pathname}${url.search}`;
        } catch {
          return item.path;
        }
      }),
    });
    for (const result of linkReport.results) addResult(report, result.status, result.label, result.detail);
  }

  await checkAgentReadinessLive(baseUrl, report, policy);
}

function checkLocalResource(distPath, item, report, policy, linkSources) {
  const foundPath = findFileInBuild(distPath, item.path, fs, path);
  if (!foundPath) {
    addResult(report, missingStatus(item, true), item.label, missingDetail(item, true));
    return;
  }
  const body = fs.readFileSync(foundPath, 'utf8');
  const validation = validateBody(item, body, { kind: item.kind, privatePathSegments: policy.privatePathSegments });
  if (item.format === 'robots') {
    if (policy.environment !== 'production' && !validation.blocksAll) {
      addResult(report, 'fail', item.label, 'development policy requires Disallow: /');
    } else if (policy.environment === 'production' && validation.blocksAll) {
      addResult(report, 'fail', item.label, 'production policy must not Disallow: / for all crawlers');
    } else if (validation.invalidSitemaps?.length) {
      addResult(report, 'fail', item.label, `invalid Sitemap URL(s): ${validation.invalidSitemaps.join(', ')}`);
    } else if (policy.environment === 'production' && !validation.sitemaps.length) {
      addResult(report, 'warn', item.label, 'no Sitemap: directive');
    } else addResult(report, 'pass', item.label, 'Found');
  } else {
    const passed = reportValidation(report, item.label, validation, 'Found');
    if (passed && validation.links?.length) linkSources.push(...validation.links);
  }
}

function checkLocalSitemap(distPath, policy, report) {
  const sitemap = findFirstExisting(distPath, policy.sitemapCandidates, fs, path);
  if (!sitemap) {
    addResult(report, policy.required.sitemap ? 'fail' : 'info', 'Vision-Ready Sitemap', policy.required.sitemap ? `missing (${policy.sitemapCandidates.join(' or ')})` : 'optional and not present');
    return;
  }
  const validation = analyzeSitemapXml(fs.readFileSync(sitemap.found, 'utf8'));
  if (validation.ok) {
    for (const warning of validation.warnings) addResult(report, 'warn', 'Vision-Ready Sitemap', `${sitemap.relative}: ${warning}`);
    addResult(report, 'pass', 'Vision-Ready Sitemap', `Found ${sitemap.relative} (${validation.urls.length} entries)`);
  } else addResult(report, 'fail', 'Vision-Ready Sitemap', `${sitemap.relative}: ${validation.errors.join('; ')}`);
}

function checkLocal(distPath, report, policy) {
  if (!report.quiet) {
    console.log(`\nDiscovery Doctor: local build at ${distPath}`);
    console.log('--------------------------------------------------');
  }
  logPolicy({ ...policy, quiet: report.quiet });
  if (!fs.existsSync(distPath)) {
    addResult(report, 'fail', 'Build directory', `Not found at ${distPath}`);
    return;
  }

  checkLocalSitemap(distPath, policy, report);
  const linkSources = [];
  for (const item of resourceItems(policy)) checkLocalResource(distPath, item, report, policy, linkSources);

  const headerAudit = auditDistTree(distPath);
  if (policy.required.headers) {
    if (headerAudit.filePath && headerAudit.ok) addResult(report, 'pass', 'Security Hardening', `Full baseline in ${path.relative(distPath, headerAudit.filePath)}`);
    else if (headerAudit.filePath) addResult(report, 'fail', 'Security Hardening', `Incomplete _headers (missing: ${(headerAudit.missing || []).join(', ') || 'unknown'})`);
    else addResult(report, 'fail', 'Security Hardening', '_headers missing under dist/ or dist/client/');
  } else if (headerAudit.filePath && headerAudit.ok) addResult(report, 'pass', 'Security Hardening', 'Full baseline found');
  else addResult(report, 'info', 'Security Hardening', 'header baseline is optional in this policy');

  const indexPaths = [path.join(distPath, 'index.html'), path.join(distPath, 'client', 'index.html')];
  let analyzed = null;
  for (const indexPath of indexPaths) {
    if (!fs.existsSync(indexPath)) continue;
    analyzed = analyzeJsonLd(fs.readFileSync(indexPath, 'utf8'));
    break;
  }
  if (!analyzed || !analyzed.hasJsonLd) addResult(report, policy.required.jsonLd ? 'fail' : 'info', 'Structured Data (JSON-LD)', 'Missing on homepage');
  else if (analyzed.malformedJsonLd > 0) addResult(report, 'fail', 'Structured Data (JSON-LD)', `${analyzed.malformedJsonLd} JSON-LD script(s) are malformed`);
  else if (!analyzed.hasWebIdentity) addResult(report, 'fail', 'Structured Data (JSON-LD)', 'Valid script found but missing WebSite/Organization/Person');
  else addResult(report, 'pass', 'Structured Data (JSON-LD)', `Found (${analyzed.types.join(', ') || 'types present'})`);
  if (analyzed?.hasBreadcrumb) addResult(report, 'pass', 'Breadcrumb Schema', 'Found');
  else addResult(report, 'warn', 'Breadcrumb Schema', 'Not on homepage (OK if nested routes use it)');

  if (linkSources.length) addResult(report, 'info', 'Discovery link checks', 'Deferred to live URL; local dist cannot prove deployed routes');

  checkAgentReadinessLocal(distPath, report, policy);
}

const { positionals, flags } = parseArgs(process.argv.slice(2));
const target = positionals[0];
const strict = Boolean(flags.strict);

const helpRequested = Boolean(flags.help || flags.h) || ['help', '-h'].includes(String(target || '').toLowerCase());
if (helpRequested || !target) {
  printHelp();
  process.exit(helpRequested ? 0 : 1);
}

const jsonMode = Boolean(flags.json);
const report = createReport({ quiet: jsonMode });

try {
  const policy = loadPolicy(flags);
  if (/^https?:\/\//i.test(target)) {
    await checkLive(assertPublicHttpUrl(target, 'base URL', { allowLoopback: policy.allowLoopback }).href, report, policy);
  } else {
    await checkLocal(path.resolve(process.cwd(), target), report, policy);
  }
} catch (error) {
  addResult(report, 'fail', 'Discovery Doctor', error instanceof Error ? error.message : String(error));
}

process.exitCode = exitCodeForReport(report, { strict });
if (jsonMode) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    target,
    ok: process.exitCode === 0,
    exitCode: process.exitCode,
    counts: report.counts,
    results: report.results
  }, null, 2)}\n`);
} else {
  console.log('--------------------------------------------------');
  console.log(`Summary: pass=${report.counts.pass || 0} fail=${report.counts.fail || 0} warn=${report.counts.warn || 0} info=${report.counts.info || 0}`);
}
