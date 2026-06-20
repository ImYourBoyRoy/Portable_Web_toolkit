// ./Web_Toolkit/site_doctor/src/commands/diff.mjs
/**
 * Compares two site-doctor reports and prints the changed steps.
 */

import fs from 'node:fs';
import path from 'node:path';
import { latestDoctorReports, readJsonIfExists } from '../lib/reports.mjs';
import { diffDoctorReports } from '../lib/summary.mjs';
import { resolveProjectRoot } from '../lib/paths.mjs';

function pickReports(flags = {}) {
  const projectRoot = resolveProjectRoot(flags);
  const latest = latestDoctorReports(projectRoot);
  const currentRaw = String(flags.current || latest[0] || '').trim();
  const previousRaw = String(flags.previous || latest[1] || '').trim();
  if (!currentRaw || !previousRaw) {
    throw new Error('Need two site-doctor JSON reports. Provide --current and --previous, or ensure at least two existing reports are present.');
  }
  const current = path.resolve(currentRaw);
  const previous = path.resolve(previousRaw);
  if (!fs.existsSync(current) || !fs.existsSync(previous)) {
    throw new Error('Need two site-doctor JSON reports. Provide --current and --previous, or ensure at least two existing reports are present.');
  }
  return { current, previous };
}

export async function runSiteDoctorDiff(flags = {}) {
  const { current, previous } = pickReports(flags);
  const currentReport = readJsonIfExists(current);
  const previousReport = readJsonIfExists(previous);
  const diff = diffDoctorReports(currentReport, previousReport);

  console.log('\nSite doctor diff');
  console.log(`- Current: ${current}`);
  console.log(`- Previous: ${previous}`);
  console.log(`- Overall: ${diff.previous.overall || 'unknown'} -> ${diff.current.overall || 'unknown'}`);
  console.log(`- Changed steps: ${diff.changedSteps.length}`);
  for (const entry of diff.changedSteps) {
    console.log(`  • ${entry.stepId}`);
  }
  return diff.changedSteps.length > 0 ? 2 : 0;
}

