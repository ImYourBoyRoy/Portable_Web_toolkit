// ./Web_Toolkit/site_quality_smoke/src/commands/diff.mjs
/**
 * Diffs two site-quality-smoke reports.
 */

import path from 'node:path';
import { resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';
import { diffReports } from '../lib/summary.mjs';
import { latestReports, readJsonIfExists } from '../lib/reports.mjs';

export async function runQualitySmokeDiff(flags = {}) {
  const resolved = resolveProfile(flags);
  const projectRoot = resolveProjectRoot(flags, resolved);
  const latest = latestReports(projectRoot);
  const currentRaw = String(flags.current || latest[0] || '').trim();
  const previousRaw = String(flags.previous || latest[1] || '').trim();
  if (!currentRaw || !previousRaw) {
    throw new Error('Need two quality-smoke reports. Provide --current and --previous, or ensure at least two existing reports are present.');
  }
  const current = path.resolve(currentRaw);
  const previous = path.resolve(previousRaw);
  const diff = diffReports(readJsonIfExists(current), readJsonIfExists(previous));
  console.log('\nSite quality smoke diff');
  console.log(`- Current: ${current}`);
  console.log(`- Previous: ${previous}`);
  console.log(`- Changed: ${diff.changed ? 'yes' : 'no'}`);
  for (const change of diff.changes || []) {
    console.log(`  - ${change.label}`);
  }
  return diff.changed ? 2 : 0;
}

