// ./src/commands/audit.mjs
/**
 * Audits branding/meta requirements and provides design-integrity warnings.
 */

import fs from 'node:fs';
import path from 'node:path';
import { detectBrandingCandidates, detectManifest, detectSeoHead } from '../lib/detect.mjs';
import { findBrandDoctorConfig } from '../lib/spec.mjs';
import { outputPaths, resolveProjectRoot } from '../lib/paths.mjs';
import { inspectImage } from '../lib/python.mjs';
import { writeReport } from '../lib/reports.mjs';

function recommendation(risk, summary, command) {
  return { risk, summary, command };
}

function assetReport(projectRoot, assetPath) {
  if (!assetPath) return { path: '', exists: false, details: null };
  let absolute = assetPath;
  
  // On Windows, /path/to/file is often considered "absolute" by path.isAbsolute,
  // but we want to treat root-relative paths starting with '/' as relative to the public folder.
  const isRootRelative = assetPath.startsWith('/') && !/^[a-zA-Z]:/.test(assetPath) && !assetPath.startsWith('\\\\');

  if (isRootRelative || !path.isAbsolute(assetPath)) {
    const normalizedRelative = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
    absolute = path.join(projectRoot, 'public', normalizedRelative);
  }
  if (!fs.existsSync(absolute)) {
    return { path: absolute, exists: false, details: null };
  }
  // SVG doesn't need Pillow inspection for basic metadata here
  if (path.extname(absolute).toLowerCase() === '.svg') {
    return { path: absolute, exists: true, details: { format: 'SVG' } };
  }
  return {
    path: absolute,
    exists: true,
    details: inspectImage(absolute, projectRoot)
  };
}

export async function runAudit(flags = {}) {
  const projectRoot = resolveProjectRoot(flags);
  const config = findBrandDoctorConfig(projectRoot);
  const seo = detectSeoHead(projectRoot);
  const manifest = detectManifest(projectRoot);
  const og = assetReport(projectRoot, seo.ogImagePath);
  const favicon = assetReport(projectRoot, seo.faviconPath);
  const appleTouch = assetReport(projectRoot, seo.appleTouchIconPath);
  const brandingCandidates = detectBrandingCandidates(projectRoot);

  const issues = [];
  const recommendations = [];
  const designWarnings = [];

  // COMPLIANCE CHECKS
  if (!seo.exists) issues.push('SEO configuration file was not found in common paths.');
  if (!seo.hasOgImage) {
    issues.push('Open Graph image metadata is missing.');
    recommendations.push(recommendation('medium', 'Generate a default Open Graph image.', `brand-doctor generate-og --project-root "${projectRoot}" --apply`));
  }
  if (og.exists && (og.details.width !== 1200 || og.details.height !== 630) && og.details.format !== 'SVG') {
    issues.push(`Open Graph image is ${og.details.width}x${og.details.height}; recommended size is 1200x630.`);
    recommendations.push(recommendation('low', 'Regenerate the Open Graph image at the recommended size.', `brand-doctor generate-og --project-root "${projectRoot}" --apply`));
  }
  if (!favicon.exists) issues.push('Favicon asset is missing.');
  if (!appleTouch.exists) issues.push('Apple touch icon is missing.');
  if (!manifest.exists) issues.push('manifest.webmanifest is missing.');

  // DESIGN INTEGRITY WARNINGS
  const bestLogo = brandingCandidates.find(c => c.is_vector || c.name.includes('logo'));
  
  if (!bestLogo) {
    designWarnings.push('No primary master logo found. Consider adding an SVG logo to src/assets.');
  } else if (bestLogo.is_raster) {
    const details = inspectImage(bestLogo.path, projectRoot);
    if (details.width < 512 || details.height < 512) {
      designWarnings.push(`Primary logo source (${bestLogo.name}) is low-res (${details.width}x${details.height}).`);
    }
    const ratio = details.width / details.height;
    if (ratio > 3 || ratio < 0.3) {
      designWarnings.push(`Primary logo source is highly rectangular (ratio ${ratio.toFixed(2)}). This may cause cropping issues in square icon templates.`);
    }
  }

  if (seo.descriptionDefault && seo.descriptionDefault.length > 200) {
    designWarnings.push('SEO description is over 200 characters and will likely be truncated in most previews.');
  }

  const hasVector = brandingCandidates.some(c => c.is_vector);
  if (!hasVector) {
    designWarnings.push('No vector branding assets (.svg) detected. Vector sources are recommended for crisp multi-scale icons.');
  }

  const report = {
    checkedAt: new Date().toISOString(),
    projectRoot,
    seo,
    manifest,
    og,
    favicon,
    appleTouch,
    brandingCandidates,
    brandingTokens: {
      hasVisuals: !!(config?.branding?.visuals || config?.brand?.visuals),
      hasColors: !!(config?.branding?.colors || config?.brand?.colors),
      hasTypography: !!(config?.branding?.typography || config?.brand?.typography)
    },
    summary: {
      overall: (issues.length > 0 || designWarnings.length > 0) ? 'warn' : 'pass',
      issues,
      designWarnings,
      recommendations
    }
  };

  const p = outputPaths(projectRoot);
  writeReport(p, report);
  
  console.log('\x1b[36m[brand-doctor]\x1b[0m Audit Report');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Overall Status: ${report.summary.overall.toUpperCase()}`);
  
  if (issues.length > 0) {
    console.log(`\n\x1b[31mCritical Issues:\x1b[0m`);
    issues.forEach(i => console.log(`  - ${i}`));
  }

  if (designWarnings.length > 0) {
    console.log(`\n\x1b[33mDesign Warnings:\x1b[0m`);
    designWarnings.forEach(w => console.log(`  - ${w}`));
  }

  console.log(`\n- Report: ${p.jsonPath}`);
  console.log(`- Markdown: ${p.mdPath}`);
  
  return report.summary.overall === 'warn' ? 2 : 0;
}
