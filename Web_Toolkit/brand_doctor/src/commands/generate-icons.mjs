// ./src/commands/generate-icons.mjs
/**
 * Generates site icons using the declarative JSON architecture.
 * Supports SVG and raster sources.
 */

import path from 'node:path';
import { findBrandDoctorConfig, loadJsonFile, mergeIconConfigAndSpec } from '../lib/spec.mjs';
import { validateConfig, validateIconSpec, validateResolvedSpec } from '../lib/schema.mjs';
import { detectBrandingCandidates } from '../lib/detect.mjs';
import { generateIco } from '../lib/python.mjs';
import { resolveProjectRoot } from '../lib/paths.mjs';

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export async function runGenerateIcons(flags = {}) {
  const projectRoot = resolveProjectRoot(flags);
  const apply = toBool(flags.apply, false);

  console.log(`\x1b[36m[brand-doctor]\x1b[0m Generating site icons...`);

  // 1. Load config
  const config = flags.config ? loadJsonFile(flags.config) : findBrandDoctorConfig(projectRoot);
  if (config) {
    const v = validateConfig(config);
    if (!v.valid) {
      console.warn(`[schema] Config validation failed: ${v.errors.join(', ')}`);
    }
  }

  // 2. Load spec
  const spec = flags.spec ? loadJsonFile(flags.spec) : null;
  if (spec) {
    const v = validateIconSpec(spec);
    if (!v.valid) {
      console.error(`[schema] Spec validation failed: ${v.errors.join(', ')}`);
      return 1;
    }
  }

  // 3. Resolve base facts for synthesis
  const candidates = detectBrandingCandidates(projectRoot);

  const synthesisCli = {
    source: flags.source,
    outputDir: flags.outputDir
  };

  // 4. Merge Pipeline
  const resolved = mergeIconConfigAndSpec(config, spec, synthesisCli);

  // 5. Synthesis: assets if not explicitly defined
  if (!resolved.assets.source) {
    const bestSource = candidates.find(c => c.is_vector || c.name.includes('logo'));
    if (bestSource) resolved.assets.source = bestSource.path;
  }
  
  if (!resolved.output.dir) {
    resolved.output.dir = path.join(projectRoot, 'public', 'assets', 'icons');
  }

  // 6. Validate Resolved Spec
  const vFinal = validateResolvedSpec(resolved);
  if (!vFinal.valid) {
    console.error(`[schema] Final merged icon spec invalid: ${vFinal.errors.join(', ')}`);
    return 1;
  }

  // 7. Prepare Python Args
  console.log(`- Source: ${resolved.assets.source}`);
  console.log(`- Directory: ${resolved.output.dir}`);
  console.log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);

  if (!apply) {
    console.log(`\n[dry-run] Spec that would be sent to renderer:`);
    console.log(JSON.stringify(resolved, null, 2));
    return 0;
  }

  try {
    const sharp = (await import('sharp')).default;
    const fs = await import('node:fs/promises');
    
    const iconSpecs = [
      { name: "favicon.png", size: 32 },
      { name: "favicon-16x16.png", size: 16 },
      { name: "favicon-32x32.png", size: 32 },
      { name: "apple-touch-icon.png", size: 180 },
      { name: "android-chrome-192x192.png", size: 192 },
      { name: "android-chrome-512x512.png", size: 512 }
    ];

    // 0. Ensure directory exists
    await fs.mkdir(resolved.output.dir, { recursive: true });

    const results = [];
    
    // 1. Generate Raster Icons (High-Fidelity PNG suite)
    for (const item of iconSpecs) {
      const targetPath = path.join(resolved.output.dir, item.name);
      await sharp(resolved.assets.source)
        .resize(item.size, item.size)
        .toFile(targetPath);
      results.push(path.relative(projectRoot, targetPath));
    }

    // 2. Generate multi-resolution ICO (16, 32, 48 via Python/Pillow)
    const masterPath = path.join(resolved.output.dir, 'master-ico-source.png');
    const icoPath = path.join(resolved.output.dir, 'favicon.ico');
    
    // Render high-res master for sub-sampling
    await sharp(resolved.assets.source)
      .resize(256, 256)
      .toFile(masterPath);

    try {
      await generateIco(masterPath, icoPath, projectRoot);
      results.push(path.relative(projectRoot, icoPath));
    } finally {
      // Clean up master source
      await fs.unlink(masterPath).catch(() => {});
    }

    // 3. Export SVG source (for modern browsers) if original is SVG
    if (resolved.assets.source.toLowerCase().endsWith('.svg')) {
      const svgPath = path.join(resolved.output.dir, 'favicon.svg');
      await fs.copyFile(resolved.assets.source, svgPath);
      results.push(path.relative(projectRoot, svgPath));
    }

    console.log(`\n\x1b[32m[SUCCESS]\x1b[0m Wrote ${results.length} assets.`);
    for (const asset of results) {
      console.log(`  - ${asset}`);
    }
    return 0;
  } catch (err) {
    console.error(`\x1b[31m[FAILED]\x1b[0m ${err.message}`);
    return 1;
  }
}
