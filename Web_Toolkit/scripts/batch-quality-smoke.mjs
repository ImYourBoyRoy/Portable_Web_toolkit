// ./Web_Toolkit/scripts/batch-quality-smoke.mjs
/**
 * Run site-quality-smoke across a manifest of site profiles.
 *
 * Usage:
 *   node ./scripts/batch-quality-smoke.mjs
 *   node ./scripts/batch-quality-smoke.mjs --manifest ./scripts/smoke-manifest.json
 *   node ./scripts/batch-quality-smoke.mjs --only example-pages
 *
 * Manifest resolution:
 *   1. --manifest <path>
 *   2. SMOKE_MANIFEST env var
 *   3. ./scripts/smoke-manifest.json (gitignored operator file)
 *   4. ./scripts/smoke-manifest.example.json (public template)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toolkitRoot = path.resolve(__dirname, '..');
const defaultManifest = path.join(__dirname, 'smoke-manifest.json');
const exampleManifest = path.join(__dirname, 'smoke-manifest.example.json');

function readFlag(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function parseOnly(argv = []) {
  const index = argv.indexOf('--only');
  if (index === -1) return null;
  return String(argv[index + 1] || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveManifestPath(argv = []) {
  const explicit = readFlag(argv, '--manifest', process.env.SMOKE_MANIFEST || '');
  if (explicit) return path.resolve(explicit);
  if (fs.existsSync(defaultManifest)) return defaultManifest;
  return exampleManifest;
}

function loadSites(manifestPath) {
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifestDir = path.dirname(manifestPath);
  const entries = Array.isArray(raw.sites) ? raw.sites : [];

  return entries.map((entry) => ({
    id: String(entry.id || '').trim(),
    profile: path.isAbsolute(entry.profile)
      ? entry.profile
      : path.resolve(manifestDir, entry.profile),
  }));
}

function runSmoke(profilePath) {
  const smokeCli = path.join(toolkitRoot, 'site_quality_smoke', 'bin', 'site-quality-smoke.mjs');
  const result = spawnSync(process.execPath, [smokeCli, 'run', '--site-profile', profilePath], {
    cwd: toolkitRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

const argv = process.argv.slice(2);
const manifestPath = resolveManifestPath(argv);
const only = parseOnly(argv);
const sites = loadSites(manifestPath);
const selected = only ? sites.filter((site) => only.includes(site.id)) : sites;
const results = [];

console.log(`[batch-quality-smoke] Manifest: ${manifestPath}`);

if (!selected.length) {
  console.log('[batch-quality-smoke] No sites configured.');
  console.log('Copy scripts/smoke-manifest.example.json to scripts/smoke-manifest.json and add your profiles.');
  process.exit(0);
}

for (const site of selected) {
  if (!site.id) {
    results.push({ id: '(missing id)', skipped: true, reason: 'Manifest entry missing id' });
    continue;
  }

  if (!fs.existsSync(site.profile)) {
    results.push({ id: site.id, skipped: true, reason: `Missing profile: ${site.profile}` });
    continue;
  }

  console.log(`\n[batch-quality-smoke] ${site.id}`);
  const outcome = runSmoke(site.profile);
  if (outcome.stdout.trim()) console.log(outcome.stdout.trim());
  if (outcome.stderr.trim()) console.error(outcome.stderr.trim());
  results.push({
    id: site.id,
    skipped: false,
    ok: outcome.ok,
    status: outcome.status,
  });
}

console.log('\n[batch-quality-smoke] Summary');
for (const entry of results) {
  if (entry.skipped) {
    console.log(`- ${entry.id}: SKIPPED (${entry.reason})`);
    continue;
  }
  console.log(`- ${entry.id}: ${entry.ok ? 'PASS' : entry.status === 2 ? 'WARN' : 'FAIL'}`);
}

const failures = results.filter((entry) => !entry.skipped && !entry.ok && entry.status !== 2);
process.exit(failures.length > 0 ? 1 : 0);
