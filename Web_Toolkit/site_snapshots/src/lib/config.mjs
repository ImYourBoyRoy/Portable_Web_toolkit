// ./Web_Toolkit/site_snapshots/src/lib/config.mjs
/**
 * Config loading for site-snapshots.
 *
 * Purpose: describe, in one small JSON file, which pages to photograph and where the images go, so any site can reuse
 * the tool without code changes. Items come from any JSON list (for example a project-sites catalog).
 * Input:  <project-root>/site-snapshots.config.json (or --config <path>)
 * Output: a normalized config plus the list of { id, url, options } items to capture.
 */

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = Object.freeze({
  source: '',
  itemsPath: '',
  idField: 'id',
  urlField: 'url',
  optionsField: 'snapshot',
  outputDir: 'src/assets/snapshots',
  manifest: 'src/data/snapshots.json',
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  quality: 84,
  settleMs: 1500,
  maxAgeDays: 30,
  driftThreshold: 0.06,
  dismissLabels: ['keep analytics off', 'reject all', 'decline', 'no thanks', 'only necessary', 'deny', 'not now'],
});

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

export function loadConfig(projectRoot, flags = {}) {
  const configPath = path.resolve(projectRoot, String(flags.config || 'site-snapshots.config.json'));
  if (!fs.existsSync(configPath)) {
    throw new Error(`No config at ${configPath}. Create site-snapshots.config.json (see site_snapshots/README.md).`);
  }
  const config = { ...DEFAULTS, ...readJson(configPath) };
  config.viewport = { ...DEFAULTS.viewport, ...(config.viewport || {}) };
  if (!config.source) throw new Error('site-snapshots config needs "source" (a JSON file listing the pages).');
  return { config, configPath };
}

/** Pull `{ id, url, options }` items out of the source JSON using dotted `itemsPath`. */
export function extractItems(projectRoot, config) {
  const raw = readJson(path.resolve(projectRoot, config.source));
  const list = config.itemsPath ? config.itemsPath.split('.').reduce((value, key) => value?.[key], raw) : raw;
  if (!Array.isArray(list)) throw new Error(`"${config.itemsPath || '(root)'}" in ${config.source} is not an array.`);
  return list
    .map((entry) => ({
      id: String(entry[config.idField] ?? ''),
      url: String(entry[config.urlField] ?? ''),
      options: (config.optionsField && entry[config.optionsField]) || {},
    }))
    .filter((item) => item.id && /^https?:\/\//.test(item.url) && item.options.skip !== true);
}
