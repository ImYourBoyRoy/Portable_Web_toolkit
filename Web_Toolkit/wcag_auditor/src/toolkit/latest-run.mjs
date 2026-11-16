// ./Web_Toolkit/wcag_auditor/src/toolkit/latest-run.mjs
/**
 * Finds the previous run of a site. Profile-built runs write to `output/wcag-auditor-<siteId>-<stamp>/`, so the
 * engine's "previous latest.json" (used for `since last run` and NEW markers) is never in the new run's own folder.
 * The stamp is ISO-based, so lexical order is chronological.
 */

import fs from 'node:fs';
import path from 'node:path';

export const RUN_FILE_NAMES = ['wcag-audit.json', 'latest.json'];

export function safeSiteId(siteId) {
  return String(siteId || 'site').replace(/[^\w.-]+/g, '-');
}

/**
 * @param {string} projectRoot
 * @param {string} siteId
 * @param {{ exclude?: string }} [options] Directory to skip (the run being started).
 * @returns {string | null} Path of the newest run JSON, or null.
 */
export function findLatestRunFile(projectRoot, siteId, { exclude } = {}) {
  const outputRoot = path.join(projectRoot, 'output');
  const prefix = `wcag-auditor-${safeSiteId(siteId)}-`;
  let names = [];
  try {
    names = fs.readdirSync(outputRoot).filter((name) => name.startsWith(prefix)).sort();
  } catch {
    return null;
  }
  for (const name of names.reverse()) {
    const directory = path.join(outputRoot, name);
    if (exclude && path.resolve(directory) === path.resolve(exclude)) continue;
    for (const fileName of RUN_FILE_NAMES) {
      const candidate = path.join(directory, fileName);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}
