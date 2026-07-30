#!/usr/bin/env node
// ./scripts/sync-readme-versions.mjs
/**
 * Sync dynamic version pins in README.md from repo truth files.
 *
 * Sources:
 *   - VERSION
 *   - .node-version
 *   - package.json / Web_Toolkit/package.json
 *   - site-starter/workers.package.json (astro, wrangler, @astrojs/cloudflare)
 *
 * Usage:
 *   node ./scripts/sync-readme-versions.mjs
 *   node ./scripts/sync-readme-versions.mjs --check   # exit 1 if README is stale
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const README = path.join(ROOT, 'README.md');
const BEGIN = '<!-- VERSIONS:BEGIN -->';
const END = '<!-- VERSIONS:END -->';

function readTrim(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').trim();
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function stripRange(v = '') {
  return String(v).replace(/^[\^~>=<\s]+/, '');
}

function buildBlock() {
  const version = readTrim('VERSION');
  const nodePin = readTrim('.node-version');
  const rootPkg = readJson('package.json');
  const toolkitPkg = readJson('Web_Toolkit/package.json');
  const starter = readJson('site-starter/workers.package.json');

  const astro = starter.dependencies?.astro ?? '';
  const cloudflare = starter.dependencies?.['@astrojs/cloudflare'] ?? '';
  const wrangler = starter.devDependencies?.wrangler ?? '';
  const enginesNode = rootPkg.engines?.node ?? toolkitPkg.engines?.node ?? '>=26';

  return [
    BEGIN,
    `**Toolkit Release:** \`v${version}\``,
    '',
    `| Component / Dependency | Version Pin | Source Location |`,
    `|---|---|---|`,
    `| **Toolkit Release** | \`v${version}\` | [\`VERSION\`](./VERSION) |`,
    `| **Node.js Engine Target** | \`${enginesNode}\` | [\`package.json\`](./package.json) |`,
    `| **Node.js Runtime Pin** | \`${nodePin}\` | [\`.node-version\`](./.node-version) |`,
    `| **Astro Framework** | \`${astro}\` | [\`site-starter/workers.package.json\`](./site-starter/workers.package.json) |`,
    `| **@astrojs/cloudflare** | \`${cloudflare}\` | [\`site-starter/workers.package.json\`](./site-starter/workers.package.json) |`,
    `| **Cloudflare Wrangler** | \`${wrangler}\` | [\`site-starter/workers.package.json\`](./site-starter/workers.package.json) |`,
    END
  ].join('\n');
}

function apply(readme, block) {
  if (readme.includes(BEGIN) && readme.includes(END)) {
    const pattern = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
    return readme.replace(pattern, block);
  }
  // Insert after the H1 title line
  const lines = readme.split('\n');
  if (lines[0]?.startsWith('# ')) {
    return [lines[0], '', block, ...lines.slice(1)].join('\n').replace(/\n{3,}/g, '\n\n');
  }
  return `${block}\n\n${readme}`;
}

const checkOnly = process.argv.includes('--check');
const current = fs.readFileSync(README, 'utf8');
const block = buildBlock();
const next = apply(current, block);

if (checkOnly) {
  if (next !== current) {
    console.error('[sync-readme-versions] README.md is out of date. Run: node ./scripts/sync-readme-versions.mjs');
    process.exit(1);
  }
  console.log('[sync-readme-versions] README.md versions are current.');
  process.exit(0);
}

if (next === current) {
  console.log('[sync-readme-versions] README.md already current.');
} else {
  fs.writeFileSync(README, next.endsWith('\n') ? next : `${next}\n`, 'utf8');
  console.log('[sync-readme-versions] Updated README.md version block from VERSION / .node-version / site-starter.');
}
