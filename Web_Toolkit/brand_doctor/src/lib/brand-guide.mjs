// ./Web_Toolkit/brand_doctor/src/lib/brand-guide.mjs
/**
 * Locate and lightly parse a project-local Brand Guide markdown file.
 *
 * Brand Guide wins on identity/voice; site-profile branding remains the
 * machine-readable execution layer. This helper surfaces guide presence,
 * hex colors, and logo path hints for audit + merge consumers.
 */

import fs from 'node:fs';
import path from 'node:path';

const CANDIDATE_RELATIVE_PATHS = Object.freeze([
  'BRAND_GUIDE.md',
  'docs/BRAND_GUIDE.md',
  'brand/BRAND_GUIDE.md',
  'Brand_Guide.md',
  'docs/Brand_Guide.md'
]);

/**
 * @param {string} projectRoot
 * @returns {{ found: boolean, path: string, relativePath: string, colors: string[], logoHints: string[], voiceHints: string[], rawLength: number, warnings: string[] }}
 */
export function findBrandGuide(projectRoot) {
  const root = path.resolve(projectRoot || '.');
  for (const relative of CANDIDATE_RELATIVE_PATHS) {
    const full = path.join(root, relative);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      return parseBrandGuide(full, root);
    }
  }
  return {
    found: false,
    path: '',
    relativePath: '',
    colors: [],
    logoHints: [],
    voiceHints: [],
    rawLength: 0,
    warnings: ['No BRAND_GUIDE.md found (checked project root, docs/, brand/).']
  };
}

/**
 * @param {string} filePath
 * @param {string} projectRoot
 */
export function parseBrandGuide(filePath, projectRoot = '') {
  const raw = fs.readFileSync(filePath, 'utf8');
  const colors = [...new Set((raw.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g) || []).map((c) => c.toLowerCase()))];
  const logoHints = [];
  for (const match of raw.matchAll(/(?:logo|icon|wordmark|favicon)[^\n`]*[`(]?([^\s`)'"]+\.(?:svg|png|webp|jpg|jpeg))/gi)) {
    if (match[1]) logoHints.push(match[1]);
  }
  const voiceHints = [];
  if (/voice|tone|copy\s*style|writing\s*style/i.test(raw)) {
    const section = raw.match(/(?:^|\n)#{1,3}\s*[^\n]*(?:voice|tone)[^\n]*\n([\s\S]{0,400})/i);
    if (section?.[1]) voiceHints.push(section[1].trim().split(/\n{2,}/)[0].slice(0, 240));
  }

  const warnings = [];
  if (colors.length === 0) warnings.push('Brand Guide has no hex color tokens (#RGB / #RRGGBB).');
  if (logoHints.length === 0) warnings.push('Brand Guide does not mention logo/icon file paths.');

  return {
    found: true,
    path: filePath,
    relativePath: projectRoot ? path.relative(projectRoot, filePath).replace(/\\/g, '/') : filePath,
    colors,
    logoHints: [...new Set(logoHints)].slice(0, 12),
    voiceHints,
    rawLength: raw.length,
    warnings
  };
}

/**
 * Compare site-profile / brand-doctor colors against guide hexes.
 * @param {{ colors?: Record<string, string> }} branding
 * @param {{ colors?: string[] }} guide
 * @returns {string[]}
 */
export function brandGuideColorDrift(branding = {}, guide = {}) {
  const guideSet = new Set((guide.colors || []).map((c) => c.toLowerCase()));
  if (guideSet.size === 0) return [];
  const drifts = [];
  for (const [key, value] of Object.entries(branding.colors || {})) {
    const hex = String(value || '').trim().toLowerCase();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(hex)) continue;
    if (!guideSet.has(hex)) {
      drifts.push(`Profile color ${key}=${hex} is not listed in Brand Guide hex tokens.`);
    }
  }
  return drifts;
}
