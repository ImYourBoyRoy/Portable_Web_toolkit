// ./Web_Toolkit/image_pipeline/src/commands/optimize.mjs
/**
 * Converts eligible raster assets to lossless WebP and can update references.
 */

import fs from 'node:fs';
import path from 'node:path';
import { outputPaths, resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';
import { convertToWebp, inspectImage } from '../lib/python.mjs';
import { writeReport } from '../lib/reports.mjs';
import { exclusionReason, scanRasterImages, scanReferenceFiles } from '../lib/scan.mjs';

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function relativeWebPath(projectRoot, filePath) {
  return `/${path.relative(path.join(projectRoot, 'public'), filePath).replace(/\\/g, '/')}`;
}

function replaceReferences(projectRoot, conversions = []) {
  let touched = 0;
  for (const filePath of scanReferenceFiles(projectRoot)) {
    let text = fs.readFileSync(filePath, 'utf8');
    const original = text;
    for (const item of conversions) {
      text = text.split(item.fromWebPath).join(item.toWebPath);
    }
    if (text !== original) {
      fs.writeFileSync(filePath, text, 'utf8');
      touched += 1;
    }
  }
  return touched;
}

export async function runOptimize(flags = {}) {
  const resolved = resolveProfile(flags);
  const projectRoot = resolveProjectRoot(flags, resolved);
  const apply = toBool(flags.apply, false);
  const replace = toBool(flags['replace-references'], false);
  const images = [];
  const conversions = [];

  for (const filePath of scanRasterImages(path.join(projectRoot, 'public'))) {
    const details = inspectImage(filePath, projectRoot);
    const reason = exclusionReason(filePath);
    const entry = {
      ...details,
      filePath,
      relativePath: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
      excludedReason: reason,
      eligibleForWebp: !reason,
      suggestedOutput: !reason ? filePath.replace(/\.(png|jpe?g)$/i, '.webp') : '',
      converted: false,
      sizeBeforeBytes: fs.statSync(filePath).size,
      sizeAfterBytes: 0
    };

    if (apply && entry.eligibleForWebp) {
      const result = convertToWebp(filePath, entry.suggestedOutput, projectRoot);
      entry.converted = true;
      entry.sizeAfterBytes = Number(result.sizeBytes || 0);
      conversions.push({
        fromWebPath: relativeWebPath(projectRoot, filePath),
        toWebPath: relativeWebPath(projectRoot, entry.suggestedOutput)
      });
    }

    images.push(entry);
  }

  const referencesUpdated = apply && replace ? replaceReferences(projectRoot, conversions) : 0;
  const summary = {
    eligibleCount: images.filter((entry) => entry.eligibleForWebp).length,
    excludedCount: images.filter((entry) => !entry.eligibleForWebp).length,
    convertedCount: images.filter((entry) => entry.converted).length,
    referencesUpdated,
    notes: [
      replace ? 'Reference replacement enabled.' : 'Reference replacement disabled; original source paths remain unchanged.',
      'Open Graph and icon assets are excluded by default.'
    ]
  };
  const report = {
    checkedAt: new Date().toISOString(),
    projectRoot,
    mode: apply ? 'optimize' : 'dry-run',
    images,
    summary
  };
  const paths = outputPaths(projectRoot);
  writeReport(paths, report);

  console.log('\nImage pipeline');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);
  console.log(`- Replace references: ${replace ? 'yes' : 'no'}`);
  console.log(`- Converted images: ${summary.convertedCount}`);
  console.log(`- Reference files updated: ${referencesUpdated}`);
  console.log(`- Report: ${paths.jsonPath}`);
  console.log(`- Markdown: ${paths.mdPath}`);
  return 0;
}

