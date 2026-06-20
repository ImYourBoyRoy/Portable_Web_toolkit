// ./Web_Toolkit/site_quality_smoke/src/lib/reports.mjs
/**
 * Report helpers for site-quality-smoke.
 */

import fs from 'node:fs';
import path from 'node:path';

export function outputPaths(projectRoot, siteId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(projectRoot, 'output');
  return {
    outputDir,
    jsonPath: path.join(outputDir, `site-quality-smoke-${siteId}-${stamp}.json`),
    mdPath: path.join(outputDir, `site-quality-smoke-${siteId}-${stamp}.md`)
  };
}

export function latestReports(projectRoot) {
  const outputDir = path.join(projectRoot, 'output');
  if (!fs.existsSync(outputDir)) return [];
  return fs.readdirSync(outputDir)
    .filter((name) => /^site-quality-smoke-.*\.json$/i.test(name))
    .map((name) => path.join(outputDir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

export function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

