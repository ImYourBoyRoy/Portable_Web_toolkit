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
 * Inputs: optional export flags (`--force` lets --to replace a non-empty
 * folder that was not created by a previous export).
 * Outputs: sanitized folder copy, optional zip, and export metadata.
 * Safety: refuses --to targets that are, contain, or sit inside the toolkit
 * (outside the runtime dir), the home directory, or a filesystem root;
 * only replaces a non-empty folder that carries EXPORT-METADATA.json; skips
 * symlinks and secret-shaped files (.env*, .dev.vars*, *.pem, *.key) at any depth.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveRuntimePath } from '../shared/lib/context.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const portableRoot = path.resolve(__dirname, '..');
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

/** Directory names never exported at any depth. */
const SKIPPED_SEGMENTS = new Set(['.runtime', '.git', '.astro', '.wrangler', '.cf-agent']);

/** .env / .env.* (except templates), .dev.vars*, private keys and certs. */
export function isSecretShapedFile(basename) {
  const name = basename.toLowerCase();
  if (name === '.env' || (name.startsWith('.env.') && !/\.(example|sample|template)$/.test(name))) return true;
  if (name === '.dev.vars' || name.startsWith('.dev.vars.')) return true;
  return /\.(pem|key|p12|pfx)$/.test(name);
}

function normalizedRelative(root, target) {
  return path.relative(root, target).replace(/\\/g, '/');
}

function includedProfiles(flags) {
  const raw = String(flags['include-site-profile'] || '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(',').map((entry) => entry.trim()).filter(Boolean));
}

export function shouldSkip(relativePath, flags = {}) {
  const normalized = relativePath.replace(/\\/g, '/');
  const basename = path.basename(normalized);
  const allowedProfiles = includedProfiles(flags);

  if (!normalized) return false;
  if (normalized === '.runtime' || normalized === '.git' || normalized === 'dist' || normalized === 'output' || normalized === 'MEMORY.md' || normalized === 'RED_TEAM_REPORT.md') return true;
  if (normalized === '.env') return true;
  if (isSecretShapedFile(basename)) return true;
  if (normalized.split('/').some((segment) => SKIPPED_SEGMENTS.has(segment))) return true;
  if (basename === '.DS_Store' || basename === 'Thumbs.db' || basename === 'doctor.txt') return true;
  if (normalized.startsWith('.runtime/')) return true;
  if (normalized.startsWith('.git/')) return true;
  if (normalized.startsWith('dist/')) return true;
  if (normalized.startsWith('output/')) return true;
  if (normalized.includes('/output/')) return true;
  if (normalized.includes('/dist/')) return true;
  // Rust build output of the setup engine: large, machine-specific, and its binaries embed local paths.
  if (normalized === 'setup_engine/target' || normalized.startsWith('setup_engine/target/')) return true;
  if (normalized === 'node_modules' || normalized.startsWith('node_modules/')) return true;
  if (normalized.includes('/node_modules/')) return true;
  if (basename === 'package-lock.json') return true;
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

const skippedSymlinks = [];

function copyRecursive(source, destination, flags) {
  const relativePath = normalizedRelative(portableRoot, source);
  if (shouldSkip(relativePath, flags)) return;

  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) {
    skippedSymlinks.push(relativePath);
    return;
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(destination, entry), flags);
    }
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  // Preserve executable bits so .sh / .command launchers stay double-clickable after export.
  fs.chmodSync(destination, stat.mode);
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
        'nested .env / .env.* / .dev.vars files, *.pem / *.key',
        'symlinks',
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
    const result = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-Command', command], { encoding: 'utf8' });
    return result.status === 0 ? { zipPath } : { error: (result.stderr || result.error?.message || 'Compress-Archive failed').trim() };
  }

  const result = spawnSync('zip', ['-qr', zipPath, '.'], { cwd: targetRoot, encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') return { error: 'zip utility not found on PATH' };
  return result.status === 0 ? { zipPath } : { error: (result.stderr || `zip exited ${result.status}`).trim() };
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Refuse export targets that could delete the toolkit, its parent, the home
 * directory, or an unrelated non-empty folder. Throws on unsafe targets.
 */
export function assertSafeExportTarget(targetRoot, { root = portableRoot, runtimeDir = resolveRuntimePath(root), force = false } = {}) {
  const target = path.resolve(targetRoot);
  const resolvedRoot = path.resolve(root);

  if (target === path.parse(target).root) throw new Error(`Refusing export target that is a filesystem root: ${target}`);
  if (target === path.resolve(os.homedir())) throw new Error(`Refusing export target that is the home directory: ${target}`);
  if (target === resolvedRoot || isInside(target, resolvedRoot)) {
    throw new Error(`Refusing export target that is or contains the toolkit itself: ${target}`);
  }
  if (isInside(resolvedRoot, target) && !isInside(path.resolve(runtimeDir), target)) {
    throw new Error(`Refusing export target inside the toolkit (only the runtime folder is allowed): ${target}`);
  }

  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`Refusing export target that is a symlink: ${target}`);
  if (!stat.isDirectory()) throw new Error(`Export target exists and is not a directory: ${target}`);
  if (fs.readdirSync(target).length === 0) return;
  if (fs.existsSync(path.join(target, 'EXPORT-METADATA.json')) || force) return;
  throw new Error(`Refusing to replace non-empty folder not created by a previous export: ${target} (pass --force to override)`);
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const targetRoot = path.resolve(String(flags.to || defaultExportRoot));
  assertSafeExportTarget(targetRoot, { force: toBool(flags.force, false) });
  if (fs.existsSync(targetRoot)) {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(targetRoot, { recursive: true });

  for (const entry of fs.readdirSync(portableRoot)) {
    copyRecursive(path.join(portableRoot, entry), path.join(targetRoot, entry), flags);
  }

  writeMetadata(targetRoot, flags);
  const wantsZip = toBool(flags.zip, false);
  const zipResult = wantsZip ? zipExport(targetRoot) : null;

  console.log('\n[portable-export] complete');
  console.log(`- export: ${targetRoot}`);
  const examples = includedExampleProfiles(targetRoot);
  console.log(`- example site profiles included: ${examples.length > 0 ? examples.join(', ') : 'none'}`);
  console.log(`- non-example site profiles included: ${toBool(flags['include-all-site-profiles'], false) || includedProfiles(flags).size > 0 ? 'selected' : 'no'}`);
  if (skippedSymlinks.length > 0) {
    console.warn(`- WARNING: skipped ${skippedSymlinks.length} symlink(s): ${skippedSymlinks.join(', ')}`);
  }
  if (zipResult?.zipPath) {
    console.log(`- zip: ${zipResult.zipPath}`);
  } else if (zipResult) {
    console.error(`- zip: FAILED (${zipResult.error})`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(__filename)) {
  try {
    main();
  } catch (error) {
    console.error(`\n[portable-export] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
