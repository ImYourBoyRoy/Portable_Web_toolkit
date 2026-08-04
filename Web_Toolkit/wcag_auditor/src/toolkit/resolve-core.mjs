// ./Web_Toolkit/wcag_auditor/src/toolkit/resolve-core.mjs
/**
 * Locate the standalone @roydawsoniv/wcag-auditor package.
 *
 * Resolution order:
 * 1. WCAG_AUDITOR_ROOT env (absolute or relative to cwd)
 * 2. node_modules/@roydawsoniv/wcag-auditor (from cwd, project, or toolkit)
 * 3. Known sibling checkouts (AI/wcag-auditor, WebDesign/wcag-auditor)
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolvePortableRoot } from '../../../shared/lib/context.mjs';

export const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);
export const BRIDGE_ROOT = path.resolve(PORTABLE_ROOT, 'wcag_auditor');

function looksLikeCore(root) {
  if (!root) return false;
  const pkg = path.join(root, 'package.json');
  const cli = path.join(root, 'src', 'cli.mjs');
  const index = path.join(root, 'src', 'index.mjs');
  if (!fs.existsSync(pkg) || !fs.existsSync(cli) || !fs.existsSync(index)) return false;
  try {
    const name = JSON.parse(fs.readFileSync(pkg, 'utf8')).name;
    return name === '@roydawsoniv/wcag-auditor' || name === 'portable-wcag-auditor';
  } catch {
    return false;
  }
}

function candidateRoots({ projectRoot = process.cwd() } = {}) {
  const envRoot = String(process.env.WCAG_AUDITOR_ROOT || '').trim();
  const roots = [];
  if (envRoot) {
    roots.push(path.isAbsolute(envRoot) ? envRoot : path.resolve(process.cwd(), envRoot));
  }

  const moduleCandidates = [
    path.join(projectRoot, 'node_modules', '@roydawsoniv', 'wcag-auditor'),
    path.join(PORTABLE_ROOT, 'node_modules', '@roydawsoniv', 'wcag-auditor'),
    path.join(process.cwd(), 'node_modules', '@roydawsoniv', 'wcag-auditor')
  ];
  roots.push(...moduleCandidates);

  // Portable_Web_toolkit/Web_Toolkit → AI/wcag-auditor
  roots.push(path.resolve(PORTABLE_ROOT, '..', '..', '..', 'wcag-auditor'));
  // Portable_Web_toolkit → WebDesign/wcag-auditor (alternate checkout)
  roots.push(path.resolve(PORTABLE_ROOT, '..', '..', 'wcag-auditor'));
  // Inside Portable_Web_toolkit/wcag-auditor (unlikely)
  roots.push(path.resolve(PORTABLE_ROOT, '..', 'wcag-auditor'));
  // Legacy nested copy (should not exist after split)
  roots.push(path.resolve(BRIDGE_ROOT, 'vendor', 'wcag-auditor'));

  return roots;
}

export function resolveCoreRoot(options = {}) {
  for (const candidate of candidateRoots(options)) {
    if (looksLikeCore(candidate)) return path.resolve(candidate);
  }

  // Last resort: Node resolution from the bridge package.
  try {
    const require = createRequire(path.join(BRIDGE_ROOT, 'package.json'));
    const pkgJson = require.resolve('@roydawsoniv/wcag-auditor/package.json');
    const root = path.dirname(pkgJson);
    if (looksLikeCore(root)) return root;
  } catch {
    // ignore
  }

  throw new Error(
    [
      'Standalone WCAG Auditor not found.',
      'Install or clone @roydawsoniv/wcag-auditor, then either:',
      '  - set WCAG_AUDITOR_ROOT to the package root, or',
      '  - place the repo at ../../wcag-auditor relative to Portable_Web_toolkit (AI/wcag-auditor), or',
      '  - npm install --save-dev @roydawsoniv/wcag-auditor / file: path to the checkout.',
      `Looked from portable root: ${PORTABLE_ROOT}`
    ].join('\n')
  );
}

export async function importCore(options = {}) {
  const root = resolveCoreRoot(options);
  const indexUrl = pathToFileURL(path.join(root, 'src', 'index.mjs')).href;
  const cliUrl = pathToFileURL(path.join(root, 'src', 'cli.mjs')).href;
  const [api, cli] = await Promise.all([import(indexUrl), import(cliUrl)]);
  return { root, api, cli };
}
