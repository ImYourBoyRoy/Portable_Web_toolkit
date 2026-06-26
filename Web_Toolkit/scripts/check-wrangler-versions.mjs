#!/usr/bin/env node
// ./Web_Toolkit/scripts/check-wrangler-versions.mjs
/**
 * Compare installed Wrangler toolchain against npm registry latest.
 * Run from client project root: node ./Web_Toolkit/scripts/check-wrangler-versions.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.env.PROJECT_ROOT || process.cwd());
const lockPath = path.join(projectRoot, 'package-lock.json');
const PACKAGES = ['wrangler', '@cloudflare/workers-types'];

function readInstalledVersion(packageName) {
  if (!existsSync(lockPath)) return null;
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const lockEntry = lock.packages?.[`node_modules/${packageName}`]?.version;
  if (lockEntry) return lockEntry;
  const root = lock.packages?.['']?.devDependencies?.[packageName]
    ?? lock.packages?.['']?.dependencies?.[packageName];
  return root?.replace(/^[^\d]*/, '') ?? null;
}

async function readLatestVersion(packageName) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`);
  if (!response.ok) {
    throw new Error(`Failed to resolve latest ${packageName}: HTTP ${response.status}`);
  }
  const payload = await response.json();
  return payload.version;
}

function compareVersions(installed, latest) {
  if (!installed) return 'missing';
  if (installed === latest) return 'current';
  return 'outdated';
}

const rows = [];

for (const packageName of PACKAGES) {
  const [installed, latest] = await Promise.all([
    Promise.resolve(readInstalledVersion(packageName)),
    readLatestVersion(packageName),
  ]);
  rows.push({ packageName, installed: installed ?? '—', latest, status: compareVersions(installed, latest) });
}

console.log(`${'Package'.padEnd(28)} Installed       Latest          Status`);
console.log('-'.repeat(72));

let hasOutdated = false;
for (const row of rows) {
  console.log(`${row.packageName.padEnd(28)} ${row.installed.padEnd(15)} ${row.latest.padEnd(15)} ${row.status}`);
  if (row.status === 'outdated' || row.status === 'missing') hasOutdated = true;
}

console.log('');
if (hasOutdated) {
  console.log('Wrangler toolchain is behind npm latest. Run: npm run upgrade:wrangler');
  process.exitCode = 1;
} else {
  console.log('Wrangler toolchain matches npm latest.');
}
