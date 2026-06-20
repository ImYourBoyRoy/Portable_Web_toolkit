// ./Web_Toolkit/image_pipeline/src/commands/audit.mjs
/**
 * Audits raster assets for potential lossless WebP conversion.
 */

import path from 'node:path';
import { outputPaths, resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';
import { inspectImage } from '../lib/python.mjs';
import { writeReport } from '../lib/reports.mjs';
import { exclusionReason, scanRasterImages } from '../lib/scan.mjs';

function buildEntry(projectRoot, filePath, details) {
  const reason = exclusionReason(filePath);
  return {
    ...details,
    filePath,
    relativePath: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
    excludedReason: reason,
    eligibleForWebp: !reason,
    suggestedOutput: !reason ? filePath.replace(/\.(png|jpe?g)$/i, '.webp') : ''
  };
}

export async function runAudit(flags = {}) {
  const resolved = resolveProfile(flags);
  const projectRoot = resolveProjectRoot(flags, resolved);
  const images = scanRasterImages(path.join(projectRoot, 'public'))
    .map((filePath) => buildEntry(projectRoot, filePath, inspectImage(filePath, projectRoot)));
  const summary = {
    eligibleCount: images.filter((entry) => entry.eligibleForWebp).length,
    excludedCount: images.filter((entry) => !entry.eligibleForWebp).length,
    convertedCount: 0,
    notes: images
      .filter((entry) => entry.extensionMismatch)
      .map((entry) => `${entry.relativePath} has extension ${entry.extension} but actual format ${entry.format}.`)
  };
  const report = {
    checkedAt: new Date().toISOString(),
    projectRoot,
    mode: 'audit',
    images,
    summary
  };
  const paths = outputPaths(projectRoot);
  writeReport(paths, report);
  console.log('\nImage pipeline');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Eligible images: ${summary.eligibleCount}`);
  console.log(`- Excluded images: ${summary.excludedCount}`);
  console.log(`- Report: ${paths.jsonPath}`);
  console.log(`- Markdown: ${paths.mdPath}`);
  return 0;
}

