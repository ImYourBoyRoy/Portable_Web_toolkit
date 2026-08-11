// ./Web_Toolkit/image_pipeline/src/commands/audit.mjs
/**
 * Audits Astro image posture + public/ rasters for gap-fill WebP conversion.
 */

import path from 'node:path';
import { analyzeAstroImagePosture } from '../lib/astro-posture.mjs';
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
  const deployTarget = String(resolved?.profile?.deployTarget || flags['deploy-target'] || '').toLowerCase();
  const astroPosture = analyzeAstroImagePosture(projectRoot, { deployTarget });

  const images = scanRasterImages(path.join(projectRoot, 'public')).map((filePath) =>
    buildEntry(projectRoot, filePath, inspectImage(filePath, projectRoot))
  );
  const summary = {
    policy: 'Astro Image/Picture first; image-pipeline fills public/ gaps only',
    eligibleCount: images.filter((entry) => entry.eligibleForWebp).length,
    excludedCount: images.filter((entry) => !entry.eligibleForWebp).length,
    convertedCount: 0,
    astroPostureStatus: astroPosture.status,
    notes: [
      ...astroPosture.notes,
      ...images
        .filter((entry) => entry.extensionMismatch)
        .map((entry) => `${entry.relativePath} has extension ${entry.extension} but actual format ${entry.format}.`)
    ]
  };
  const report = {
    checkedAt: new Date().toISOString(),
    projectRoot,
    mode: 'audit',
    astroPosture,
    images,
    summary
  };
  const paths = outputPaths(projectRoot);
  writeReport(paths, report);

  console.log('\nImage pipeline audit');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Policy: ${summary.policy}`);
  console.log(`- Astro posture: ${astroPosture.status.toUpperCase()}`);
  for (const issue of astroPosture.issues) console.warn(`  ✗ ${issue}`);
  for (const warning of astroPosture.warnings) console.warn(`  ⚠ ${warning}`);
  console.log(`- public/ eligible rasters: ${summary.eligibleCount}`);
  console.log(`- public/ excluded: ${summary.excludedCount}`);
  console.log(`- Report: ${paths.jsonPath}`);
  console.log(`- Markdown: ${paths.mdPath}`);

  if (astroPosture.status === 'fail') return 2;
  if (astroPosture.status === 'warn') return 2;
  return 0;
}
