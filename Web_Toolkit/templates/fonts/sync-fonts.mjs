// ./Web_Toolkit/templates/fonts/sync-fonts.mjs
/**
 * Self-host fonts from installed @fontsource / @fontsource-variable packages.
 *
 * Reads fonts.config.json, copies the matching woff2 files into public/fonts/ (content-hashed names), writes
 * src/styles/fonts.generated.css (@font-face with unicode-range, plus a metric-matched fallback face per family) and
 * src/styles/fonts.manifest.json (what was copied, byte sizes, ready-made font stacks, preload list).
 * Deterministic and idempotent: no timestamps, files are rewritten only when their bytes change, and files this script
 * wrote earlier (listed in the previous manifest) are removed when they are no longer wanted.
 * Zero dependencies; copy this file with fonts-lib.mjs and woff2-metrics.mjs.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  SYSTEM_FALLBACKS,
  buildManifest,
  computeFallbackMetrics,
  generateCss,
  hashedFileName,
  installCommand,
  parseConfigText,
  pickMetricsFace,
  planFaces,
  validateConfig
} from './fonts-lib.mjs';
import { readFontMetrics } from './woff2-metrics.mjs';

const HELP = `sync-fonts: self-host fonts from installed @fontsource packages

Usage:
  node sync-fonts.mjs [--config <path>] [--root <dir>] [--check] [--json] [--quiet]
  node sync-fonts.mjs --help

Flags:
  --config <path>  Config file (default: <root>/fonts.config.json). See fonts.config.example.json.
  --root <dir>     Project root holding node_modules, public/ and src/ (default: current directory).
  --check          Verify generated files are current; write nothing. Exit 2 when they drift (use in CI).
  --json           Print the result as JSON on stdout.
  --quiet          Print errors only.
  --help           Show this text.

Examples:
  node scripts/fonts/sync-fonts.mjs
  node scripts/fonts/sync-fonts.mjs --check
  node scripts/fonts/sync-fonts.mjs --root ../site --config ../site/fonts.config.json --json

Side effects (not with --check): writes <outDir>/*.woff2, <cssOut>, <manifestOut>; deletes woff2 files that an earlier
run listed in the manifest and the config no longer needs. Never touches other files.

Exit codes: 0 ok / in sync, 1 usage error or crash, 2 invalid config, missing package or font file, or --check drift.`;

class SyncError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

function detectPackageManager(root) {
  const checks = [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lockb', 'bun'], ['bun.lock', 'bun'], ['package-lock.json', 'npm']];
  for (const directory of ancestors(root)) {
    for (const [file, manager] of checks) if (existsSync(path.join(directory, file))) return manager;
  }
  return undefined;
}

function* ancestors(start) {
  let current = path.resolve(start);
  for (;;) {
    yield current;
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

/** Finds an installed package directory by walking up node_modules folders (works with pnpm symlinks and hoisting). */
function findPackageDir(root, name) {
  for (const directory of ancestors(root)) {
    const candidate = path.join(directory, 'node_modules', ...name.split('/'));
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
  }
  return null;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeIfChanged(file, content) {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  if (existsSync(file) && Buffer.compare(readFileSync(file), next) === 0) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, next);
  return true;
}

function listAvailable(packageDir, slug) {
  const directory = path.join(packageDir, 'files');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.startsWith(`${slug}-`) && name.endsWith('.woff2')).sort();
}

/**
 * Runs the sync. Returns { ok, changed, written, unchanged, removed, drift, manifest, css, warnings } or throws SyncError.
 * `check` computes everything and compares with disk instead of writing.
 */
export function runSync({ root = process.cwd(), configPath, check = false } = {}) {
  const projectRoot = path.resolve(root);
  const configFile = path.resolve(configPath ?? path.join(projectRoot, 'fonts.config.json'));
  if (!existsSync(configFile)) {
    throw new SyncError(`Config not found: ${configFile}\nCopy templates/fonts/fonts.config.example.json to fonts.config.json and edit the families.`);
  }

  const validation = validateConfig(parseConfigText(readFileSync(configFile, 'utf8'), path.basename(configFile)));
  if (!validation.valid) {
    throw new SyncError(`Invalid ${path.basename(configFile)}:\n${validation.errors.map((message) => `  - ${message}`).join('\n')}`);
  }
  const { config } = validation;
  const warnings = [...validation.warnings];

  // 1. Every package must be installed. Report all that are missing at once, with the exact install command.
  const packageDirs = new Map();
  const missing = [];
  for (const family of config.families) {
    if (packageDirs.has(family.package)) continue;
    const found = findPackageDir(projectRoot, family.package);
    if (found) packageDirs.set(family.package, found);
    else missing.push(family.package);
  }
  if (missing.length > 0) {
    throw new SyncError(`Font package(s) not installed: ${missing.join(', ')}\n  Install: ${installCommand(missing, detectPackageManager(projectRoot))}\n  (Then re-run this script. Variable fonts live in @fontsource-variable/<id>, static weights in @fontsource/<id>.)`);
  }

  // 2. Read every source file, hash it, and plan its public name.
  const faces = planFaces(config);
  const problems = [];
  const resolved = faces.map((face) => {
    const packageDir = packageDirs.get(face.package);
    const sourcePath = path.join(packageDir, 'files', face.sourceName);
    if (!existsSync(sourcePath)) {
      const available = listAvailable(packageDir, face.slug);
      problems.push(`${face.package}: no file "${face.sourceName}" (${face.family} ${face.style} ${face.weight} ${face.subset}).${available.length ? ` Available: ${available.join(', ')}` : ' The package has no files/ folder matching this family id; set "id" in the config.'}`);
      return null;
    }
    const buffer = readFileSync(sourcePath);
    const { file, sha256 } = hashedFileName(face.baseName, buffer);
    return { face, buffer, file, sha256, url: `${config.urlBase}/${file}`, bytes: buffer.length };
  });
  if (problems.length > 0) throw new SyncError(`Font file(s) missing from installed packages:\n${problems.map((line) => `  - ${line}`).join('\n')}`);

  // 3. Per family: measure the web font, derive the fallback face.
  const entries = config.families.map((family) => {
    const familyFaces = resolved.filter((item) => item.face.family === family.family);
    const target = pickMetricsFace(familyFaces.map((item) => item.face));
    let web = family.metrics;
    let metricsSource = family.metrics ? 'config' : null;
    if (!web && target) {
      try {
        web = readFontMetrics(familyFaces.find((item) => item.face === target).buffer);
        metricsSource = `font file (${web.xWidthSource})`;
      } catch (error) {
        warnings.push(`${family.family}: could not read font metrics (${error.message}); no fallback face generated. Add "metrics" to the config to supply them.`);
      }
    }
    const packageDir = packageDirs.get(family.package);
    let packageVersion = null;
    try {
      packageVersion = readJson(path.join(packageDir, 'package.json')).version ?? null;
    } catch {
      packageVersion = null;
    }
    return {
      family: family.family,
      role: family.role,
      package: family.package,
      packageVersion,
      variable: family.variable,
      display: family.display,
      fallbackKind: family.fallback,
      fallback: web ? computeFallbackMetrics(web, SYSTEM_FALLBACKS[family.fallback].metrics) : null,
      metricsSource,
      faces: familyFaces
    };
  });

  const css = generateCss(entries, { cssOut: config.cssOut });
  const manifest = buildManifest(config, entries, warnings);
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

  const outDir = path.join(projectRoot, config.outDir);
  const cssPath = path.join(projectRoot, config.cssOut);
  const manifestPath = path.join(projectRoot, config.manifestOut);
  const wanted = new Set(resolved.map((item) => item.file));

  // Files an earlier run wrote (known from the previous manifest) that are no longer wanted.
  const stale = [];
  if (existsSync(manifestPath)) {
    try {
      for (const family of readJson(manifestPath).families ?? []) {
        for (const file of family.files ?? []) {
          if (typeof file.file === 'string' && !wanted.has(file.file) && /^[\w.-]+\.woff2$/.test(file.file) && existsSync(path.join(outDir, file.file))) stale.push(file.file);
        }
      }
    } catch {
      // An unreadable previous manifest only means nothing is pruned.
    }
  }

  const result = { ok: true, changed: false, written: [], unchanged: [], removed: [], drift: [], manifest, css, warnings };
  const track = (name, changed) => {
    (changed ? result.written : result.unchanged).push(name);
    if (changed) result.changed = true;
  };

  if (check) {
    for (const item of resolved) {
      const target = path.join(outDir, item.file);
      if (!existsSync(target) || Buffer.compare(readFileSync(target), item.buffer) !== 0) result.drift.push(`${config.outDir}/${item.file}`);
    }
    for (const [file, content] of [[cssPath, css], [manifestPath, manifestText]]) {
      if (!existsSync(file) || readFileSync(file, 'utf8') !== content) result.drift.push(path.relative(projectRoot, file).replace(/\\/g, '/'));
    }
    result.drift.push(...stale.map((file) => `${config.outDir}/${file} (stale)`));
    result.ok = result.drift.length === 0;
    return result;
  }

  for (const item of resolved) track(`${config.outDir}/${item.file}`, writeIfChanged(path.join(outDir, item.file), item.buffer));
  track(config.cssOut, writeIfChanged(cssPath, css));
  track(config.manifestOut, writeIfChanged(manifestPath, manifestText));
  for (const file of stale) {
    const target = path.join(outDir, file);
    if (statSync(target).isFile()) {
      unlinkSync(target);
      result.removed.push(`${config.outDir}/${file}`);
      result.changed = true;
    }
  }
  return result;
}

function formatBytes(bytes) {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${bytes} B`;
}

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        config: { type: 'string' },
        root: { type: 'string' },
        check: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        quiet: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false }
      },
      allowPositionals: false
    });
  } catch (error) {
    console.error(`sync-fonts: ${error.message}\n\n${HELP}`);
    return 1;
  }
  const { values } = parsed;
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  try {
    const result = runSync({ root: values.root, configPath: values.config, check: values.check });
    if (values.json) {
      const { css, ...rest } = result;
      console.log(JSON.stringify({ ...rest, cssBytes: Buffer.byteLength(css) }, null, 2));
    } else if (!values.quiet) {
      for (const warning of result.warnings) console.warn(`sync-fonts: warning: ${warning}`);
      if (values.check) {
        console.log(result.ok ? 'sync-fonts: fonts are in sync' : `sync-fonts: out of date (run without --check):\n${result.drift.map((line) => `  - ${line}`).join('\n')}`);
      } else {
        const { totals } = result.manifest;
        console.log(`sync-fonts: ${totals.files} font file(s), ${formatBytes(totals.bytes)} total; ${result.written.length} written, ${result.unchanged.length} unchanged, ${result.removed.length} removed`);
        for (const family of result.manifest.families) console.log(`  ${family.family}: ${family.files.length} file(s)  stack: ${family.stack}`);
        if (result.manifest.preload.length > 0) console.log(`  preload: ${result.manifest.preload.map((entry) => entry.url).join(', ')}`);
      }
    }
    return result.ok ? 0 : 2;
  } catch (error) {
    console.error(`sync-fonts: ${error.message}`);
    return error instanceof SyncError ? error.exitCode : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href) {
  process.exitCode = main(process.argv.slice(2));
}
