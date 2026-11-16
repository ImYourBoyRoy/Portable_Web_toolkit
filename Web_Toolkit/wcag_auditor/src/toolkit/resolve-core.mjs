// ./Web_Toolkit/wcag_auditor/src/toolkit/resolve-core.mjs
/**
 * Resolve the WCAGate engine for toolkit site-profile workflows.
 *
 * The engine is `@imyourboyroy/wcagate` from GitHub, installed under
 * `Web_Toolkit/node_modules`. This module never walks `AI/` sibling trees.
 *
 * Missing engine: `pnpm install` (npm when pnpm is absent) in `Web_Toolkit/` (auto-ensure unless skipped).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSyncCross } from '../../../shared/lib/spawn-cross.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { maybeAutoUpdate } from '../../../shared/lib/auto-update.mjs';
import { WCAGATE_REPOSITORY_SPEC, WCAGATE_SPEC, engineInstallCommand } from '../../../shared/lib/engine-spec.mjs';

const ENGINE_PACKAGE = '@imyourboyroy/wcagate';
const ENGINE_GITHUB = WCAGATE_SPEC;
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
          'Run: cd Web_Toolkit && pnpm install (or npm install)'
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
      'Install: cd Web_Toolkit && pnpm install (or npm install)',
      'That fetches the latest WCAGate release tag (semver range, never a pinned version).',
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
      'WCAGATE_REF must be a GitHub ref (a tag or branch name), not a filesystem path. Use WCAGATE_ROOT only for a local WCAGate package checkout that is not AI/wcag-auditor.'
    );
  }
  return `${WCAGATE_REPOSITORY_SPEC}#${ref}`;
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

function runInstall(plan) {
  return spawnSyncCross(plan.command, plan.args, {
    cwd: WEB_TOOLKIT_ROOT,
    stdio: 'inherit',
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
  // An update does not refetch git dependencies, so refreshing or pinning a ref reinstalls the spec; otherwise install from package.json.
  const plan = engineInstallCommand({ spec, refresh: wantUpdate });
  const result = runInstall(plan);
  if (result.status !== 0) {
    throw missingEngineError(`${plan.manager} ${plan.args.join(' ')} failed with exit ${result.status}.`);
  }

  installed = resolveFromNodeModules();
  if (!installed) throw missingEngineError('The engine install finished but @imyourboyroy/wcagate is still missing.');
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
