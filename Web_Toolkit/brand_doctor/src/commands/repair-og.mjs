// ./Web_Toolkit/brand_doctor/src/commands/repair-og.mjs
/**
 * Re-encodes the existing Open Graph asset to a real PNG when the file path
 * expects PNG but the underlying bitstream is a different format.
 */

import path from 'node:path';
import { detectSeoHead } from '../lib/detect.mjs';
import { resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';
import { inspectImage, rewritePng } from '../lib/python.mjs';

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export async function runRepairOg(flags = {}) {
  const resolved = resolveProfile(flags);
  const projectRoot = resolveProjectRoot(flags, resolved);
  const seo = detectSeoHead(projectRoot);
  const relative = seo.ogImagePath || '/assets/og-image.png';
  const absolute = path.join(projectRoot, 'public', relative.replace(/^\/+/, ''));
  const details = inspectImage(absolute, projectRoot);
  const apply = toBool(flags.apply, false);

  console.log('\nBrand doctor: repair Open Graph asset');
  console.log(`- Asset: ${absolute}`);
  console.log(`- Current format: ${details.format}`);
  console.log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);
  if (!details.extensionMismatch) {
    console.log('- No repair needed.');
    return 0;
  }
  if (!apply) return 0;
  rewritePng(absolute, absolute, projectRoot);
  console.log('- Re-encoded the Open Graph asset as a real PNG file.');
  return 0;
}

