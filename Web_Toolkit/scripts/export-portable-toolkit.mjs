#!/usr/bin/env node
// ./Web_Toolkit/scripts/export-portable-toolkit.mjs
/**
 * Share-safe export utility for the full portable toolkit.
 *
 * Creates a reusable copy of the `portable` folder without secrets, runtime
 * outputs, nested export artifacts, or site-specific profiles unless they are
 * explicitly requested. Run via:
 *   node ./scripts/export-portable-toolkit.mjs [--to <dir>] [--zip]
 *        [--include-site-profile client-a.json,client-b.json]
 *        [--include-all-site-profiles]
 *
 * Inputs: optional export flags.
 * Outputs: sanitized folder copy, optional zip, and export metadata.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveRuntimePath } from '../shared/lib/context.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const portableRoot = path.resolve(__dirname, '..');
const defaultExportRoot = resolveRuntimePath(portableRoot, 'exports', 'portable-toolkit');

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizedRelative(root, target) {
  return path.relative(root, target).replace(/\\/g, '/');
}

function includedProfiles(flags) {
  const raw = String(flags['include-site-profile'] || '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(',').map((entry) => entry.trim()).filter(Boolean));
}

function shouldSkip(relativePath, flags) {
  const normalized = relativePath.replace(/\\/g, '/');
  const basename = path.basename(normalized);
  const allowedProfiles = includedProfiles(flags);

  if (!normalized) return false;
  if (normalized === '.runtime' || normalized === '.git' || normalized === 'dist' || normalized === 'output' || normalized === 'MEMORY.md') return true;
  if (normalized === '.env') return true;
  if (basename === '.DS_Store' || basename === 'Thumbs.db' || basename === 'doctor.txt') return true;
  if (normalized.startsWith('.runtime/')) return true;
  if (normalized.startsWith('.git/')) return true;
  if (normalized.startsWith('dist/')) return true;
  if (normalized.startsWith('output/')) return true;
  if (normalized.includes('/output/')) return true;
  if (normalized.includes('/dist/')) return true;
  if (normalized.includes('/node_modules/')) return true;
  if (normalized.includes('/.cf-agent/')) return true;
  if (normalized.includes('/__pycache__/')) return true;
  if (normalized.endsWith('/.env')) return true;
  if (normalized.startsWith('site-profiles/') && basename !== 'example-workers.json' && basename !== 'example-pages.json') {
    return !toBool(flags['include-all-site-profiles'], false) && !allowedProfiles.has(basename);
  }
  if (normalized.startsWith('Private_Site_Profiles/') || normalized.includes('/Private_Site_Profiles/')) {
    return true;
  }
  return false;
}

function copyRecursive(source, destination, flags) {
  const relativePath = normalizedRelative(portableRoot, source);
  if (shouldSkip(relativePath, flags)) return;

  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(destination, entry), flags);
    }
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function includedExampleProfiles(targetRoot) {
  const dir = path.join(targetRoot, 'site-profiles');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => /^example-.*\.json$/i.test(name)).sort();
}

function writeMetadata(targetRoot, flags) {
  const metadata = {
    createdAt: new Date().toISOString(),
    exportName: path.basename(targetRoot),
    includedAllSiteProfiles: toBool(flags['include-all-site-profiles'], false),
    includedSiteProfiles: [...includedProfiles(flags)],
    includedExampleProfiles: includedExampleProfiles(targetRoot),
    sanitized: {
      excluded: [
        '.env',
        '.runtime/',
        'dist/',
        'output/',
        'node_modules/',
        'nested .env files',
        'runtime logs',
        'non-example site profiles unless explicitly requested',
        'MEMORY.md'
      ]
    },
    platform: {
      os: os.platform(),
      arch: os.arch(),
      node: process.version
    }
  };
  fs.writeFileSync(path.join(targetRoot, 'EXPORT-METADATA.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function zipExport(targetRoot) {
  const zipPath = `${targetRoot}.zip`;
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });

  if (process.platform === 'win32') {
    const command = `Compress-Archive -Path "${targetRoot}\\*" -DestinationPath "${zipPath}" -Force`;
    const result = spawnSync('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
    return result.status === 0 ? zipPath : null;
  }

  const result = spawnSync('zip', ['-qr', zipPath, '.'], { cwd: targetRoot, encoding: 'utf8' });
  return result.status === 0 ? zipPath : null;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const targetRoot = path.resolve(String(flags.to || defaultExportRoot));
  if (fs.existsSync(targetRoot)) {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(targetRoot, { recursive: true });

  for (const entry of fs.readdirSync(portableRoot)) {
    copyRecursive(path.join(portableRoot, entry), path.join(targetRoot, entry), flags);
  }

  writeMetadata(targetRoot, flags);
  const zipPath = toBool(flags.zip, false) ? zipExport(targetRoot) : null;

  console.log('\n[portable-export] complete');
  console.log(`- export: ${targetRoot}`);
  const examples = includedExampleProfiles(targetRoot);
  console.log(`- example site profiles included: ${examples.length > 0 ? examples.join(', ') : 'none'}`);
  console.log(`- non-example site profiles included: ${toBool(flags['include-all-site-profiles'], false) || includedProfiles(flags).size > 0 ? 'selected' : 'no'}`);
  if (zipPath) {
    console.log(`- zip: ${zipPath}`);
  } else if (toBool(flags.zip, false)) {
    console.log('- zip: skipped (zip utility unavailable on this host)');
  }
}

main();


