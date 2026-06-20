// ./Web_Toolkit/integration_doctor/src/lib/reports.mjs
/**
 * Report helpers for integration-doctor.
 */

import fs from 'node:fs';
import path from 'node:path';

export function outputPaths(projectRoot, siteId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(projectRoot, 'output');
  return {
    outputDir,
    jsonPath: path.join(outputDir, `integration-doctor-${siteId}-${stamp}.json`),
    mdPath: path.join(outputDir, `integration-doctor-${siteId}-${stamp}.md`)
  };
}

export function latestEmailAudit(projectRoot) {
  const outputDir = path.join(projectRoot, 'output');
  if (!fs.existsSync(outputDir)) return null;
  const latest = fs.readdirSync(outputDir)
    .filter((name) => /^email-audit-.*\.json$/i.test(name))
    .map((name) => path.join(outputDir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  return latest ? JSON.parse(fs.readFileSync(latest, 'utf8')) : null;
}

