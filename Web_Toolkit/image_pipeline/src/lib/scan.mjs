// ./Web_Toolkit/image_pipeline/src/lib/scan.mjs
/**
 * File scanning rules for the image pipeline.
 */

import fs from 'node:fs';
import path from 'node:path';

const RASTER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const REFERENCE_EXTENSIONS = new Set(['.astro', '.html', '.css', '.js', '.mjs', '.ts', '.tsx', '.json', '.md', '.txt']);

export function exclusionReason(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const name = path.basename(normalized);
  if (normalized.includes('/assets/icons/')) return 'icon asset';
  if (name.includes('favicon')) return 'favicon asset';
  if (name.includes('apple-touch-icon')) return 'apple-touch-icon asset';
  if (name.includes('og-image') || name.includes('og-preview') || name.includes('open-graph')) return 'open graph asset';
  if (/\/icon-\d+\.png$/i.test(normalized)) return 'manifest icon asset';
  return '';
}

export function scanRasterImages(rootDir) {
  const matches = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'output'].includes(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }
      if (RASTER_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        matches.push(fullPath);
      }
    }
  }
  return matches.sort();
}

export function scanReferenceFiles(rootDir) {
  const matches = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'output'].includes(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }
      if (REFERENCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        matches.push(fullPath);
      }
    }
  }
  return matches.sort();
}

