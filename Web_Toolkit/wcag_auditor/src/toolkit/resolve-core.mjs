// ./Web_Toolkit/wcag_auditor/src/toolkit/resolve-core.mjs
/**
 * Resolve the WCAG auditor core bundled inside this Web_Toolkit module.
 *
 * Website / toolkit workflows MUST stay self-contained: never resolve into
 * sibling AI/ checkouts or other trees outside Web_Toolkit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BRIDGE_ROOT = MODULE_ROOT;
export const PORTABLE_ROOT = path.resolve(MODULE_ROOT, '..');

function looksLikeCore(root) {
  if (!root) return false;
  const pkg = path.join(root, 'package.json');
  const cli = path.join(root, 'src', 'cli.mjs');
  const index = path.join(root, 'src', 'index.mjs');
  return fs.existsSync(pkg) && fs.existsSync(cli) && fs.existsSync(index);
}

export function resolveCoreRoot() {
  if (looksLikeCore(BRIDGE_ROOT)) return BRIDGE_ROOT;
  throw new Error(
    [
      'WCAG Auditor core is missing from the linked Web_Toolkit.',
      `Expected bundled package at: ${BRIDGE_ROOT}`,
      'Re-link or update Portable Web Toolkit so Web_Toolkit/wcag_auditor includes src/cli.mjs.',
      'Website workflows do not use AI/ sibling checkouts.'
    ].join('\n')
  );
}

export async function importCore() {
  const root = resolveCoreRoot();
  const indexUrl = pathToFileURL(path.join(root, 'src', 'index.mjs')).href;
  const cliUrl = pathToFileURL(path.join(root, 'src', 'cli.mjs')).href;
  const [api, cli] = await Promise.all([import(indexUrl), import(cliUrl)]);
  return { root, api, cli };
}
