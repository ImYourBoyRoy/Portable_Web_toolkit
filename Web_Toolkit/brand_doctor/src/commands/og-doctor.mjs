// ./src/commands/og-doctor.mjs
/**
 * Intelligent OpenGraph assistant: audit-env, suggest, and preview.
 * Refactored for 2026 standards and pyenv-native integration.
 */

import path from 'node:path';
import { auditPythonEnv, resolveBrandDoctorPython } from '../lib/env.mjs';
import { detectBrandingCandidates, detectSeoHead } from '../lib/detect.mjs';
import { runGenerateOg } from './generate-og.mjs';

/**
 * suggestAssets: ranked by source_quality_score.
 */
function suggestAssets(projectRoot) {
  return detectBrandingCandidates(projectRoot);
}

export async function runOgDoctor(flags = {}) {
  const projectRoot = flags.projectRoot || process.cwd();
  const mode = String(flags.mode || 'audit').toLowerCase();

  if (mode === 'audit-env') {
    console.log(`\x1b[36m[og-doctor]\x1b[0m Environment Audit`);
    const pythonPath = resolveBrandDoctorPython(projectRoot);
    const result = auditPythonEnv(pythonPath);
    
    console.log(`- Interpreter: ${result.path || 'Not found'}`);
    console.log(`- Status: ${result.available ? '\x1b[32mFOUND\x1b[0m' : '\x1b[31mMISSING\x1b[0m'}`);
    console.log(`- Dependencies (Pillow, CairoSVG): ${result.deps ? '\x1b[32mOK\x1b[0m' : '\x1b[31mMISSING\x1b[0m'}`);
    
    if (result.error) {
      console.log(`\n\x1b[31mError Details:\x1b[0m`);
      console.log(result.error);
    }
    
    if (!result.deps) {
      console.log(`\n- Recommendation: Run 'brand-doctor setup-env' to prepare the environment.`);
    }

    return result.deps ? 0 : 1;
  }

  if (mode === 'suggest') {
    console.log(`\x1b[36m[og-doctor]\x1b[0m Asset Discovery`);
    const suggestions = suggestAssets(projectRoot);
    if (suggestions.length === 0) {
      console.log('- No suitable branding assets found.');
    } else {
      console.log(`- Found ${suggestions.length} candidates (ranked by source quality):`);
      suggestions.slice(0, 10).forEach((s, i) => {
        const qualityColor = s.source_quality_score > 70 ? '\x1b[32m' : s.source_quality_score > 40 ? '\x1b[33m' : '\x1b[31m';
        console.log(`  ${i + 1}. ${path.relative(projectRoot, s.path)} [Quality: ${qualityColor}${s.source_quality_score}\x1b[0m] ${s.is_vector ? '(Vector)' : ''}`);
      });
    }
    return 0;
  }

  if (mode === 'audit') {
    console.log(`\x1b[36m[og-doctor]\x1b[0m Metadata Audit`);
    const seo = detectSeoHead(projectRoot);
    if (!seo.exists) {
      console.error(`- Error: No SEO configuration/layout file found.`);
      return 1;
    }

    const checks = {
      'OG Image': seo.ogImagePath,
      'Site Name': seo.siteName,
      'Description': seo.descriptionDefault,
      'Theme Color': seo.hasThemeColor,
      'Favicon': seo.faviconPath,
      'Apple Touch': seo.appleTouchIconPath,
      'Manifest': seo.manifestPath
    };

    let missing = 0;
    for (const [key, val] of Object.entries(checks)) {
      const status = val ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
      console.log(`- ${key.padEnd(15)} [${status}]`);
      if (!val) missing++;
    }

    if (missing > 0) {
      console.log(`\n- Recommendation: Run 'brand-doctor audit' for a full design and compliance report.`);
    }
    return 0;
  }

  if (mode === 'preview') {
    // Simply proxy to generate-og with a preview output path
    console.log(`\x1b[36m[og-doctor]\x1b[0m Preview Generation`);
    const previewFlags = {
      ...flags,
      output: path.join(projectRoot, 'public', 'assets', 'og-preview.png')
    };
    return runGenerateOg(previewFlags);
  }

  console.error(`Unknown mode: ${mode}`);
  return 1;
}
