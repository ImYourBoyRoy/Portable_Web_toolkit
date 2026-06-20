// ./src/commands/generate-og.mjs
/**
 * Generates an Open Graph image using the declarative JSON architecture.
 */

import fs from 'node:fs';
import path from 'node:path';
import { findBrandDoctorConfig, loadJsonFile, mergeConfigAndSpec } from '../lib/spec.mjs';
import { validateConfig, validateOgSpec, validateResolvedSpec } from '../lib/schema.mjs';
import { detectSeoHead, detectBrandingCandidates, detectThemeColors } from '../lib/detect.mjs';
import { generateOg } from '../lib/python.mjs';
import { resolveProjectRoot } from '../lib/paths.mjs';

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export async function runGenerateOg(flags = {}) {
  const projectRoot = resolveProjectRoot(flags);
  const apply = toBool(flags.apply, false);

  console.log(`\x1b[36m[brand-doctor]\x1b[0m Generating Open Graph image...`);

  // 1. Load config
  const config = flags.config ? loadJsonFile(flags.config) : findBrandDoctorConfig(projectRoot);

  // 2. Load spec (Auto-discover og.spec.json in root if not provided)
  let specPath = flags.spec;
  if (!specPath) {
    const autoSpec = path.join(projectRoot, 'og.spec.json');
    if (fs.existsSync(autoSpec)) {
      specPath = autoSpec;
    }
  }

  const spec = specPath ? loadJsonFile(specPath) : null;
  
  if (config) {
    const v = validateConfig(config);
    if (!v.valid) console.warn(`[schema] Config validation failed: ${v.errors.join(', ')}`);
  }

  if (spec) {
    const v = validateOgSpec(spec);
    if (!v.valid) {
      console.error(`[schema] Spec validation failed: ${v.errors.join(', ')}`);
      return 1;
    }
  }

  // 3. Resolve base facts for synthesis if no spec provided
  const seo = detectSeoHead(projectRoot);
  const candidates = detectBrandingCandidates(projectRoot);
  detectThemeColors(projectRoot);

  const synthesisCli = {
    title: flags.title || seo.siteName || seo.titleDefault || 'Site Preview',
    subtitle: flags.subtitle || seo.descriptionDefault || 'Replace this subtitle with the site value',
    eyebrow: flags.eyebrow || flags.badge || (seo.filePath ? path.basename(projectRoot).toUpperCase() : 'PORTFOLIO'),
    layout: flags.layout,
    theme: flags.theme || 'dark', 
    output: flags.output,
    visuals: {}
  };

  // Allow passing key visual tokens via CLI for quick AI tweaks
  if (flags.signatureOffset) synthesisCli.visuals.signature_offset_px = parseInt(flags.signatureOffset, 10);
  if (flags.glowPasses) synthesisCli.visuals.glow_passes = parseInt(flags.glowPasses, 10);
  if (flags.delimiter) synthesisCli.visuals.signature_delimiter = flags.delimiter;

  // 4. Merge Pipeline
  const resolved = mergeConfigAndSpec(config, spec, synthesisCli);

  // 5. Synthesis: assets if not explicitly defined
  if (!resolved.assets.logo) {
    const logoCand = candidates.find(c => c.name.includes('logo') || c.is_vector);
    if (logoCand) resolved.assets.logo = logoCand.path;
  }
  if (!resolved.assets.portrait) {
    const portraitCand = candidates.find(c => c.name.includes('profile') || c.name.includes('portrait'));
    if (portraitCand) resolved.assets.portrait = portraitCand.path;
  }
  if (!resolved.output.path) {
    resolved.output.path = path.join(projectRoot, 'public', 'assets', 'og-image.png');
  }

  // 6. Validate Resolved Spec
  const vFinal = validateResolvedSpec(resolved);
  if (!vFinal.valid) {
    console.error(`[schema] Final merged spec invalid: ${vFinal.errors.join(', ')}`);
    return 1;
  }

  // 7. Prepare Python Args
  resolved.project_root = projectRoot; // Inject for Python side
  console.log(`- Layout: ${resolved.layout.mode}`);
  console.log(`- Title: ${resolved.content.title}`);
  console.log(`- Output: ${resolved.output.path}`);
  console.log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);

  if (!apply) {
    console.log(`\n[dry-run] Spec that would be sent to renderer:`);
    console.log(JSON.stringify(resolved, null, 2));
    return 0;
  }

  try {
    const result = await generateOg(resolved, projectRoot);
    console.log(`\n\x1b[32m[SUCCESS]\x1b[0m Generated: ${result.output}`);
    console.log(`- Size: ${result.width}x${result.height}`);
    console.log(`- Layout used: ${result.layout_used}`);
    return 0;
  } catch (err) {
    console.error(`\x1b[31m[FAILED]\x1b[0m ${err.message}`);
    return 1;
  }
}
