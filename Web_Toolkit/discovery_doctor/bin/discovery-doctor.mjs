#!/usr/bin/env node
// ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs
/**
 * Discovery Doctor - Zenith-Level Posture Auditor
 * Audits discovery manifests, deep storytelling endpoints, and security signatures.
 * Verifies sitemaps, robots, LLM context, Structured Data, and Search APIs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { assertPublicHttpUrl, fetchPublicText } from '../../shared/lib/url-safety.mjs';
import { auditDistTree } from '../../headers_deploy/src/lib/audit-lib.mjs';

const REQUIRED_PATHS = [
  { path: '/sitemap.xml', label: 'Vision-Ready Sitemap', format: 'xml' },
  { path: '/robots.txt', label: 'AI-Friendly Robots', format: 'text' },
  { path: '/llms.txt', label: 'AI Context (llms.txt)', format: 'text' },
  { path: '/llms-full.txt', label: 'Full AI Manifest (llms-full.txt)', format: 'text' },
  { path: '/api/content.json', label: 'Structured Content API', format: 'json' },
  { path: '/api/search.json?q=test', label: 'Dynamic Search API', format: 'json' },
  { path: '/humans.txt', label: 'Dynamic Humans.txt', format: 'text' },
  { path: '/.well-known/security.txt', label: 'Security Hygiene (RFC 9116)', format: 'text' }
];

async function checkUrl(baseUrl) {
  const normalizedBase = assertPublicHttpUrl(baseUrl, 'base URL').href;
  console.log(`\n🩺 Discovery Doctor: Auditing Live Zenith Posture at ${normalizedBase}`);
  console.log('--------------------------------------------------');
  
  for (const item of REQUIRED_PATHS) {
    const fullUrl = new URL(item.path, normalizedBase).href;
    try {
      const result = await fetchPublicText(fullUrl, { label: item.label });
      if (result.ok) {
        console.log(`[PASS] ${item.label.padEnd(25)}: ✅ Found (${result.status})`);
      } else {
        console.warn(`[FAIL] ${item.label.padEnd(25)}: ❌ Missing (${result.status})`);
      }
    } catch (e) {
      console.error(`[FAIL] ${item.label.padEnd(25)}: ❌ Error: ${e.message}`);
    }
  }

  try {
    const result = await fetchPublicText(normalizedBase, { label: 'homepage' });
    const html = result.body;
    if (html.includes('application/ld+json')) {
      console.log(`[PASS] ${'Structured Data (JSON-LD)'.padEnd(25)}: ✅ Found`);
      if (html.includes('BreadcrumbList')) {
        console.log(`[PASS] ${'Breadcrumb Schema'.padEnd(25)}: ✅ Found`);
      } else {
        console.warn(`[FAIL] ${'Breadcrumb Schema'.padEnd(25)}: ❌ Missing depth`);
      }
    } else {
      console.warn(`[FAIL] ${'Structured Data (JSON-LD)'.padEnd(25)}: ❌ Missing`);
    }
  } catch (e) {
    console.error(`[FAIL] Structured Data Check: ❌ Error: ${e.message}`);
  }
}

function findFileInBuild(distPath, itemPath) {
  // Clean query params for local filesystem check
  const cleanPath = itemPath.split('?')[0];
  
  // Check primary path
  let fullPath = path.join(distPath, cleanPath);
  if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) return fullPath;

  // Check client/ subdirectory
  const clientPath = path.join(distPath, 'client', cleanPath);
  if (fs.existsSync(clientPath) && !fs.statSync(clientPath).isDirectory()) return clientPath;

  // Check for directory-style index.html
  if (!cleanPath.includes('.')) {
    const indexPath = path.join(distPath, cleanPath, 'index.html');
    if (fs.existsSync(indexPath)) return indexPath;
    
    const clientIndexPath = path.join(distPath, 'client', cleanPath, 'index.html');
    if (fs.existsSync(clientIndexPath)) return clientIndexPath;
  }

  return null;
}

async function checkBuild(distPath) {
  console.log(`\n🩺 Discovery Doctor: Auditing Local Build Posture at ${distPath}`);
  console.log('--------------------------------------------------');
  
  if (!fs.existsSync(distPath)) {
    console.error(`Error: Build directory not found at ${distPath}`);
    return;
  }

  for (const item of REQUIRED_PATHS) {
    const foundPath = findFileInBuild(distPath, item.path);
    // Note: search.json is SSR (prerender: false), so it WON'T be in a static build folder.
    if (item.path.includes('search.json')) {
        console.log(`[INFO] ${item.label.padEnd(25)}: 🚀 Performed at runtime (SSR)`);
        continue;
    }

    if (foundPath) {
      console.log(`[PASS] ${item.label.padEnd(25)}: ✅ Found`);
    } else {
      console.warn(`[FAIL] ${item.label.padEnd(25)}: ❌ Missing (Checked dist/ + dist/client/)`);
    }
  }

  const headerAudit = auditDistTree(distPath);
  if (headerAudit.filePath && headerAudit.ok) {
    console.log(`[PASS] ${'Security Hardening'.padEnd(25)}: ✅ Full baseline in ${path.relative(distPath, headerAudit.filePath)}`);
    for (const header of headerAudit.present) {
      console.log(`       ✓ ${header}`);
    }
  } else if (headerAudit.filePath) {
    console.warn(`[FAIL] ${'Security Hardening'.padEnd(25)}: ❌ Incomplete _headers at ${path.relative(distPath, headerAudit.filePath)}`);
    for (const header of headerAudit.missing) {
      console.warn(`       ✗ ${header}`);
    }
  } else {
    console.warn(`[FAIL] ${'Security Hardening'.padEnd(25)}: ❌ _headers missing under dist/`);
  }

  // Check homepage for JSON-LD
  const indexPaths = [
    path.join(distPath, 'index.html'),
    path.join(distPath, 'client', 'index.html')
  ];
  let jsonLdFound = false;
  for (const p of indexPaths) {
    if (fs.existsSync(p)) {
      const html = fs.readFileSync(p, 'utf-8');
      if (html.includes('application/ld+json')) {
        jsonLdFound = true;
        if (html.includes('BreadcrumbList')) {
            console.log(`[PASS] ${'Discovery Depth'.padEnd(25)}: ✅ Breadcrumbs Detected`);
        } else {
            console.warn(`[FAIL] ${'Discovery Depth'.padEnd(25)}: ❌ Breadcrumbs Missing`);
        }
        break;
      }
    }
  }

  if (jsonLdFound) {
    console.log(`[PASS] ${'Structured Data (JSON-LD)'.padEnd(25)}: ✅ Found`);
  } else {
    console.warn(`[FAIL] ${'Structured Data (JSON-LD)'.padEnd(25)}: ❌ Missing`);
  }
}

function printHelp() {
  console.log('discovery-doctor — Audit discovery files and AI-readable endpoints');
  console.log('');
  console.log('Usage:');
  console.log('  discovery-doctor <url|dist_path>');
  console.log('');
  console.log('Examples:');
  console.log('  discovery-doctor https://example.com');
  console.log('  discovery-doctor dist');
}

const target = process.argv[2];

if (!target || ['help', '--help', '-h'].includes(String(target).toLowerCase())) {
  printHelp();
  process.exit(target ? 0 : 1);
}

if (target.startsWith('http')) {
  await checkUrl(target);
} else {
  await checkBuild(path.resolve(process.cwd(), target));
}
