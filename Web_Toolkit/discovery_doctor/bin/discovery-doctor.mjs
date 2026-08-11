#!/usr/bin/env node
// ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs
/**
 * Discovery Doctor — Zenith discovery posture auditor (fail-closed).
 *
 * Usage:
 *   discovery-doctor <url|dist_path> [--strict]
 *
 * Exit codes:
 *   0 — no failures (warnings allowed unless --strict)
 *   1 — usage / invalid target
 *   2 — one or more check failures
 */

import fs from 'node:fs';
import path from 'node:path';
import { assertPublicHttpUrl, fetchPublicText } from '../../shared/lib/url-safety.mjs';
import { auditDistTree } from '../../headers_deploy/src/lib/audit-lib.mjs';
import { addResult, createReport, exitCodeForReport } from '../src/report.mjs';
import {
  analyzeJsonLd,
  findFileInBuild,
  findFirstExisting,
  looksLikeJson,
  looksLikeSitemapXml,
  robotsReferencesSitemap
} from '../src/validate.mjs';

const SITEMAP_CANDIDATES = ['/sitemap.xml', '/sitemap-index.xml'];

const REQUIRED_PATHS = [
  { path: '/robots.txt', label: 'AI-Friendly Robots', format: 'text', required: true },
  { path: '/llms.txt', label: 'AI Context (llms.txt)', format: 'text', required: true },
  { path: '/llms-full.txt', label: 'Full AI Manifest (llms-full.txt)', format: 'text', required: true },
  { path: '/api/content.json', label: 'Structured Content API', format: 'json', required: true },
  { path: '/api/search.json?q=test', label: 'Dynamic Search API', format: 'json', required: false, ssrOk: true },
  { path: '/humans.txt', label: 'Dynamic Humans.txt', format: 'text', required: true },
  { path: '/.well-known/security.txt', label: 'Security Hygiene (RFC 9116)', format: 'text', required: true }
];

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        i += 1;
      }
    } else positionals.push(token);
  }
  return { positionals, flags };
}

function printHelp() {
  console.log('discovery-doctor — Audit discovery files and AI-readable endpoints');
  console.log('');
  console.log('Usage:');
  console.log('  discovery-doctor <url|dist_path> [--strict]');
  console.log('');
  console.log('Exit codes:');
  console.log('  0  no failures (warnings OK unless --strict)');
  console.log('  1  usage error');
  console.log('  2  one or more check failures');
  console.log('');
  console.log('Examples:');
  console.log('  discovery-doctor ./dist');
  console.log('  discovery-doctor ./dist/client');
  console.log('  discovery-doctor https://example.com');
}

async function checkUrl(baseUrl, report) {
  const normalizedBase = assertPublicHttpUrl(baseUrl, 'base URL').href;
  console.log(`\nDiscovery Doctor: live posture at ${normalizedBase}`);
  console.log('--------------------------------------------------');

  let sitemapOk = false;
  for (const candidate of SITEMAP_CANDIDATES) {
    const fullUrl = new URL(candidate, normalizedBase).href;
    try {
      const result = await fetchPublicText(fullUrl, { label: 'sitemap' });
      if (result.ok && looksLikeSitemapXml(result.body)) {
        addResult(report, 'pass', 'Vision-Ready Sitemap', `Found ${candidate} (${result.status})`);
        sitemapOk = true;
        break;
      }
    } catch {
      // try next
    }
  }
  if (!sitemapOk) {
    addResult(report, 'fail', 'Vision-Ready Sitemap', `Missing or invalid (${SITEMAP_CANDIDATES.join(' or ')})`);
  }

  for (const item of REQUIRED_PATHS) {
    const fullUrl = new URL(item.path, normalizedBase).href;
    try {
      const result = await fetchPublicText(fullUrl, { label: item.label });
      if (!result.ok) {
        if (item.required) addResult(report, 'fail', item.label, `Missing (${result.status})`);
        else addResult(report, 'warn', item.label, `Missing (${result.status})`);
        continue;
      }
      if (item.format === 'json' && !looksLikeJson(result.body)) {
        addResult(report, 'fail', item.label, 'Present but not valid JSON');
        continue;
      }
      if (item.path === '/robots.txt') {
        if (!robotsReferencesSitemap(result.body)) {
          addResult(report, 'warn', item.label, 'Found but no Sitemap: directive');
        } else {
          addResult(report, 'pass', item.label, `Found (${result.status})`);
        }
        continue;
      }
      addResult(report, 'pass', item.label, `Found (${result.status})`);
    } catch (error) {
      if (item.required) addResult(report, 'fail', item.label, `Error: ${error.message}`);
      else addResult(report, 'warn', item.label, `Error: ${error.message}`);
    }
  }

  try {
    const result = await fetchPublicText(normalizedBase, { label: 'homepage' });
    const jsonLd = analyzeJsonLd(result.body || '');
    if (!jsonLd.hasJsonLd) {
      addResult(report, 'fail', 'Structured Data (JSON-LD)', 'Missing');
    } else if (!jsonLd.hasWebIdentity) {
      addResult(report, 'fail', 'Structured Data (JSON-LD)', 'Found script but missing WebSite/Organization/Person');
    } else {
      addResult(report, 'pass', 'Structured Data (JSON-LD)', `Found (${jsonLd.types.join(', ') || 'types present'})`);
    }
    if (jsonLd.hasJsonLd && !jsonLd.hasBreadcrumb) {
      addResult(report, 'warn', 'Breadcrumb Schema', 'Not on homepage (OK if nested routes only)');
    } else if (jsonLd.hasBreadcrumb) {
      addResult(report, 'pass', 'Breadcrumb Schema', 'Found');
    }
  } catch (error) {
    addResult(report, 'fail', 'Structured Data (JSON-LD)', `Error: ${error.message}`);
  }
}

async function checkBuild(distPath, report) {
  console.log(`\nDiscovery Doctor: local build at ${distPath}`);
  console.log('--------------------------------------------------');

  if (!fs.existsSync(distPath)) {
    addResult(report, 'fail', 'Build directory', `Not found at ${distPath}`);
    return;
  }

  const sitemap = findFirstExisting(distPath, SITEMAP_CANDIDATES, fs, path);
  if (sitemap) {
    const text = fs.readFileSync(sitemap.found, 'utf8');
    if (looksLikeSitemapXml(text)) {
      addResult(report, 'pass', 'Vision-Ready Sitemap', `Found ${sitemap.relative}`);
    } else {
      addResult(report, 'fail', 'Vision-Ready Sitemap', `${sitemap.relative} is not valid sitemap XML`);
    }
  } else {
    addResult(report, 'fail', 'Vision-Ready Sitemap', `Missing (${SITEMAP_CANDIDATES.join(' or ')})`);
  }

  for (const item of REQUIRED_PATHS) {
    if (item.ssrOk) {
      const foundPath = findFileInBuild(distPath, item.path, fs, path);
      if (foundPath) {
        const text = fs.readFileSync(foundPath, 'utf8');
        if (item.format === 'json' && !looksLikeJson(text)) {
          addResult(report, 'fail', item.label, 'Present but not valid JSON');
        } else {
          addResult(report, 'pass', item.label, 'Found in dist');
        }
      } else {
        addResult(report, 'info', item.label, 'Performed at runtime (SSR) — verify on live URL');
      }
      continue;
    }

    const foundPath = findFileInBuild(distPath, item.path, fs, path);
    if (!foundPath) {
      addResult(report, item.required ? 'fail' : 'warn', item.label, 'Missing (checked dist/ + dist/client/)');
      continue;
    }
    const text = fs.readFileSync(foundPath, 'utf8');
    if (item.format === 'json' && !looksLikeJson(text)) {
      addResult(report, 'fail', item.label, 'Present but not valid JSON');
      continue;
    }
    if (item.path === '/robots.txt' && !robotsReferencesSitemap(text)) {
      addResult(report, 'warn', item.label, 'Found but no Sitemap: directive');
      continue;
    }
    addResult(report, 'pass', item.label, 'Found');
  }

  const headerAudit = auditDistTree(distPath);
  if (headerAudit.filePath && headerAudit.ok) {
    addResult(report, 'pass', 'Security Hardening', `Full baseline in ${path.relative(distPath, headerAudit.filePath)}`);
  } else if (headerAudit.filePath) {
    addResult(
      report,
      'fail',
      'Security Hardening',
      `Incomplete _headers (missing: ${(headerAudit.missing || []).join(', ') || 'unknown'})`
    );
  } else {
    addResult(report, 'fail', 'Security Hardening', '_headers missing under dist/ or dist/client/');
  }

  const indexPaths = [
    path.join(distPath, 'index.html'),
    path.join(distPath, 'client', 'index.html')
  ];
  let analyzed = null;
  for (const indexPath of indexPaths) {
    if (!fs.existsSync(indexPath)) continue;
    analyzed = analyzeJsonLd(fs.readFileSync(indexPath, 'utf8'));
    break;
  }
  if (!analyzed || !analyzed.hasJsonLd) {
    addResult(report, 'fail', 'Structured Data (JSON-LD)', 'Missing on homepage');
  } else if (!analyzed.hasWebIdentity) {
    addResult(report, 'fail', 'Structured Data (JSON-LD)', 'Found script but missing WebSite/Organization/Person');
  } else {
    addResult(report, 'pass', 'Structured Data (JSON-LD)', `Found (${analyzed.types.join(', ') || 'types present'})`);
  }
  if (analyzed?.hasJsonLd && !analyzed.hasBreadcrumb) {
    addResult(report, 'warn', 'Breadcrumb Schema', 'Not on homepage (OK if nested routes only)');
  } else if (analyzed?.hasBreadcrumb) {
    addResult(report, 'pass', 'Breadcrumb Schema', 'Found');
  }
}

const { positionals, flags } = parseArgs(process.argv.slice(2));
const target = positionals[0];
const strict = Boolean(flags.strict);

if (!target || ['help', '--help', '-h'].includes(String(target).toLowerCase())) {
  printHelp();
  process.exit(target ? 0 : 1);
}

const report = createReport();

try {
  if (/^https?:\/\//i.test(target)) {
    await checkUrl(target, report);
  } else {
    await checkBuild(path.resolve(process.cwd(), target), report);
  }
} catch (error) {
  addResult(report, 'fail', 'Discovery Doctor', error instanceof Error ? error.message : String(error));
}

console.log('--------------------------------------------------');
console.log(
  `Summary: pass=${report.counts.pass || 0} fail=${report.counts.fail || 0} warn=${report.counts.warn || 0} info=${report.counts.info || 0}`
);

process.exitCode = exitCodeForReport(report, { strict });
