// ./Web_Toolkit/wcag_auditor/src/toolkit/resolve-core.mjs
/**
 * Resolve the WCAGate engine for toolkit site-profile workflows.
 *
 * The engine is `@imyourboyroy/wcagate` from GitHub, installed under
 * `Web_Toolkit/node_modules`. This module never walks `AI/` sibling trees.
 *
 * Missing engine: `npm install` in `Web_Toolkit/` (auto-ensure unless skipped).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { maybeAutoUpdate } from '../../../shared/lib/auto-update.mjs';

const ENGINE_PACKAGE = '@imyourboyroy/wcagate';
const ENGINE_GITHUB = 'github:imyourboyroy/WCAGate';
const FORBIDDEN_CORE_MARKERS = ['/AI/wcag-auditor', '\\AI\\wcag-auditor', '/wcag-auditor/src/cli.mjs'];

export const BRIDGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PORTABLE_ROOT = path.resolve(BRIDGE_ROOT, '..');
export const WEB_TOOLKIT_ROOT = PORTABLE_ROOT;

function engineLooksValid(root) {
  if (!root) return false;
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.name !== ENGINE_PACKAGE) return false;
  } catch {
    return false;
  }
  return (
    fs.existsSync(path.join(root, 'bin', 'wcagate.mjs'))
    && fs.existsSync(path.join(root, 'src', 'index.mjs'))
    && fs.existsSync(path.join(root, 'src', 'cli.mjs'))
  );
}

function assertNotForbidden(root) {
  const normalized = String(root || '').replace(/\\/g, '/');
  for (const marker of FORBIDDEN_CORE_MARKERS) {
    if (normalized.includes(marker.replace(/\\/g, '/'))) {
      throw new Error(
        [
          'WCAGate engine resolution refused a workstation AI/ checkout.',
          `Rejected path: ${root}`,
          'Install github:imyourboyroy/WCAGate into Web_Toolkit/node_modules instead.',
          'Run: cd Web_Toolkit && npm install'
        ].join('\n')
      );
    }
  }
}

function missingEngineError(detail = '') {
  return new Error(
    [
      'WCAGate engine is missing from the linked Web_Toolkit.',
      'This folder is a site-profile wrapper only. The engine is @imyourboyroy/wcagate.',
      'Install: cd Web_Toolkit && npm install',
      'That fetches github:imyourboyroy/WCAGate (unpinned default branch).',
      'Do not git clone into AI/wcag-auditor and point the toolkit at it.',
      'Do not git submodule this folder.',
      detail
    ].filter(Boolean).join('\n')
  );
}

function resolveFromNodeModules() {
  try {
    const require = createRequire(path.join(WEB_TOOLKIT_ROOT, 'package.json'));
    const pkgJson = require.resolve(`${ENGINE_PACKAGE}/package.json`);
    const root = path.dirname(pkgJson);
    if (engineLooksValid(root)) return root;
  } catch {
    // not installed
  }
  const nested = path.join(WEB_TOOLKIT_ROOT, 'node_modules', ENGINE_PACKAGE);
  if (engineLooksValid(nested)) return nested;
  return null;
}

function gitSpecFromEnv() {
  const ref = String(process.env.WCAGATE_REF || '').trim();
  if (!ref) return ENGINE_GITHUB;
  if (ref.startsWith('github:') || ref.startsWith('git+')) return ref;
  if (ref.startsWith('/') || ref.startsWith('.') || ref.includes('\\')) {
    throw new Error(
      'WCAGATE_REF must be a GitHub ref (for example v2.3.1), not a filesystem path. Use WCAGATE_ROOT only for a local WCAGate package checkout that is not AI/wcag-auditor.'
    );
  }
  return `${ENGINE_GITHUB}#${ref}`;
}

function resolveExplicitRoot() {
  const raw = String(process.env.WCAGATE_ROOT || '').trim();
  if (!raw) return null;
  const root = path.resolve(raw);
  assertNotForbidden(root);
  if (!engineLooksValid(root)) {
    throw missingEngineError(`WCAGATE_ROOT is set but is not a valid ${ENGINE_PACKAGE} package: ${root}`);
  }
  return root;
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runNpm(args) {
  // npm 12+ defaults allow-git=none. WCAGate is a GitHub git dependency.
  const withGit = args.includes('--allow-git=all') ? args : [...args, '--allow-git=all'];
  return spawnSync(npmCommand(), withGit, {
    cwd: WEB_TOOLKIT_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env
  });
}

/**
 * Install or update WCAGate into Web_Toolkit/node_modules.
 * @param {{ skip?: boolean, update?: boolean }} [options]
 * @returns {string} engine package root
 */
export function ensureEngine({ skip = false, update = false } = {}) {
  const skipInstall = skip
    || process.env.WCAGATE_SKIP_INSTALL === '1'
    || process.env.WCAGATE_SKIP_INSTALL === 'true';
  const wantUpdate = update
    || process.env.WCAGATE_UPDATE === '1'
    || process.env.WCAGATE_UPDATE === 'true';

  const explicit = resolveExplicitRoot();
  if (explicit) return explicit;

  let installed = resolveFromNodeModules();
  if (installed && !wantUpdate) {
    assertNotForbidden(installed);
    return installed;
  }

  if (skipInstall) {
    if (installed) {
      assertNotForbidden(installed);
      return installed;
    }
    throw missingEngineError('Auto-install was skipped (--skip-engine-install / WCAGATE_SKIP_INSTALL).');
  }

  const spec = gitSpecFromEnv();
  console.error(`[wcag-auditor] ensuring WCAGate engine (${spec}) in ${WEB_TOOLKIT_ROOT}`);
  // `npm update` does not refetch unpinned git dependencies. Reinstall the spec
  // when updating or pinning a ref; otherwise `npm install` from package.json.
  const args = wantUpdate || spec !== ENGINE_GITHUB
    ? ['install', spec]
    : ['install'];
  const result = runNpm(args);
  if (result.status !== 0) {
    throw missingEngineError(`npm ${args.join(' ')} failed with exit ${result.status}.`);
  }

  installed = resolveFromNodeModules();
  if (!installed) throw missingEngineError('npm install finished but @imyourboyroy/wcagate is still missing.');
  assertNotForbidden(installed);
  return installed;
}

export function resolveCoreRoot(options = {}) {
  if (options.autoUpdate !== false && options.skip !== true) {
    maybeAutoUpdate({ portableRoot: WEB_TOOLKIT_ROOT });
  }
  const ensure = options.ensure !== false && options.skip !== true;
  if (ensure) return ensureEngine(options);
  const explicit = resolveExplicitRoot();
  if (explicit) return explicit;
  const installed = resolveFromNodeModules();
  if (installed) {
    assertNotForbidden(installed);
    return installed;
  }
  throw missingEngineError();
}

export async function importCore(options = {}) {
  const root = resolveCoreRoot(options);
  const indexUrl = pathToFileURL(path.join(root, 'src', 'index.mjs')).href;
  const cliUrl = pathToFileURL(path.join(root, 'src', 'cli.mjs')).href;
  const [api, cli] = await Promise.all([import(indexUrl), import(cliUrl)]);
  return { root, api, cli };
}
