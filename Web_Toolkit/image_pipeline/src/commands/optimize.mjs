// ./Web_Toolkit/image_pipeline/src/commands/optimize.mjs
/**
 * Converts eligible raster assets to WebP and optionally AVIF; can update references.
 */

import fs from 'node:fs';
import path from 'node:path';
import { outputPaths, resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';
import { convertToAvif, convertToWebp, inspectImage } from '../lib/python.mjs';
import { writeReport } from '../lib/reports.mjs';
import { exclusionReason, scanRasterImages, scanReferenceFiles } from '../lib/scan.mjs';

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function resolveFormats(flags = {}) {
  const raw = String(flags.format || flags.formats || 'webp').trim().toLowerCase();
  if (raw === 'both' || raw === 'webp,avif' || raw === 'avif,webp') return ['webp', 'avif'];
  if (raw === 'avif') return ['avif'];
  return ['webp'];
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
  const formats = resolveFormats(flags);
  const images = [];
  const conversions = [];
  const warnings = [];

  for (const filePath of scanRasterImages(path.join(projectRoot, 'public'))) {
    const details = inspectImage(filePath, projectRoot);
    const reason = exclusionReason(filePath);
    const entry = {
      ...details,
      filePath,
      relativePath: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
      excludedReason: reason,
      eligibleForWebp: !reason,
      formatsRequested: formats,
      suggestedOutputs: {},
      converted: [],
      errors: [],
      sizeBeforeBytes: fs.statSync(filePath).size,
      sizeAfterBytes: {}
    };

    if (!reason) {
      if (formats.includes('webp')) {
        entry.suggestedOutputs.webp = filePath.replace(/\.(png|jpe?g)$/i, '.webp');
      }
      if (formats.includes('avif')) {
        entry.suggestedOutputs.avif = filePath.replace(/\.(png|jpe?g|webp)$/i, '.avif');
      }
    }

    if (apply && entry.eligibleForWebp) {
      if (formats.includes('webp') && entry.suggestedOutputs.webp) {
        try {
          const result = convertToWebp(filePath, entry.suggestedOutputs.webp, projectRoot);
          entry.converted.push('webp');
          entry.sizeAfterBytes.webp = Number(result.sizeBytes || 0);
          conversions.push({
            fromWebPath: relativeWebPath(projectRoot, filePath),
            toWebPath: relativeWebPath(projectRoot, entry.suggestedOutputs.webp),
            format: 'webp'
          });
        } catch (error) {
          entry.errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      if (formats.includes('avif') && entry.suggestedOutputs.avif) {
        try {
          const result = convertToAvif(filePath, entry.suggestedOutputs.avif, projectRoot);
          entry.converted.push('avif');
          entry.sizeAfterBytes.avif = Number(result.sizeBytes || 0);
          // Do not auto-replace references to AVIF — prefer <picture> in templates
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          entry.errors.push(message);
          warnings.push(`${entry.relativePath}: ${message}`);
        }
      }
    }

    images.push(entry);
  }

  // Reference replacement only for WebP siblings (safe default)
  const webpConversions = conversions.filter((item) => item.format === 'webp');
  const referencesUpdated = apply && replace ? replaceReferences(projectRoot, webpConversions) : 0;
  const summary = {
    formats,
    eligibleCount: images.filter((entry) => entry.eligibleForWebp).length,
    excludedCount: images.filter((entry) => entry.excludedReason).length,
    convertedCount: images.filter((entry) => entry.converted.length > 0).length,
    avifConvertedCount: images.filter((entry) => entry.converted.includes('avif')).length,
    referencesUpdated,
    warnings,
    notes: [
      replace
        ? 'Reference replacement enabled for WebP only (AVIF should use <picture>/srcset in templates).'
        : 'Reference replacement disabled; original source paths remain unchanged.',
      'Open Graph and icon assets are excluded by default.',
      formats.includes('avif')
        ? 'AVIF requires Pillow with libavif (or pillow-avif-plugin); failures are reported per-file without aborting the batch.'
        : 'Default format is WebP. Pass --format avif or --format both for optional AVIF siblings.'
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
  console.log(`- Formats: ${formats.join(', ')}`);
  console.log(`- Replace references: ${replace ? 'yes (webp only)' : 'no'}`);
  console.log(`- Converted images: ${summary.convertedCount}`);
  if (formats.includes('avif')) console.log(`- AVIF conversions: ${summary.avifConvertedCount}`);
  console.log(`- Reference files updated: ${referencesUpdated}`);
  if (warnings.length) {
    console.log(`- Warnings: ${warnings.length}`);
    for (const warning of warnings.slice(0, 5)) console.warn(`  • ${warning}`);
  }
  console.log(`- Report: ${paths.jsonPath}`);
  console.log(`- Markdown: ${paths.mdPath}`);
  return warnings.length > 0 && summary.convertedCount === 0 && apply && formats.includes('avif') && !formats.includes('webp')
    ? 2
    : 0;
}
