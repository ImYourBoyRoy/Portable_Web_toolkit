// ./src/lib/spec.mjs
/**
 * Spec Management for Brand Doctor.
 * Handles loading, merging, and normalizing configs and specs.
 */

import fs from 'fs';
import path from 'path';

/**
 * Loads a JSON file safely.
 */
export function loadJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn(`[spec] Failed to parse JSON at ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Finds the brand-doctor.config.json in the project root.
 */
export function findBrandDoctorConfig(projectRoot) {
  const configPath = path.join(projectRoot, 'brand-doctor.config.json');
  return loadJsonFile(configPath);
}

/**
 * Deep merges source into target.
 */
export function deepMerge(target, source) {
  if (!source) return target;
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && key in target && target[key] instanceof Object && !Array.isArray(source[key])) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/**
 * Merges defaults, config, CLI, and spec for Open Graph.
 */
export function mergeConfigAndSpec(config, spec, cli = {}) {
  const defaults = {
    version: 1,
    type: 'open_graph',
    meta: { site_name: 'Website' },
    content: { 
      title: 'Website', 
      subtitle: '', 
      eyebrow: '' 
    },
    layout: { 
      mode: 'master-polish-5.5', 
      alignment: 'left', 
      logo_placement: 'auto', 
      show_logo: true, 
      show_portrait: true 
    },
    visuals: {
      signature_enabled: true,
      signature_delimiter: "|",
      signature_offset_px: 1,
      glow_passes: 5,
      aurora_enabled: true,
      aurora_blur: 160,
      noise_intensity: 0.005,
      portrait_blur_radius: 1
    },
    assets: { 
      logo: '', 
      portrait: '', 
      background_image: '' 
    },
    colors: { 
      background: '#08080d', 
      accent: '#c45142', 
      text_primary: '#ffffff', 
      text_secondary: '#a0a0b0',
      glow: '#c45142'
    },
    typography: {
      title_font: { path: '', size: 100 },
      body_font: { path: '', size: 36 },
      eyebrow_font: { path: '', size: 34 },
      subtitle_font: { path: '', size: 32 }
    },
    output: { width: 1200, height: 630, format: 'PNG' },
    rules: { max_title_lines: 2, max_description_lines: 4, allow_truncation: true }
  };

  // 1. Start with defaults
  let merged = JSON.parse(JSON.stringify(defaults));

  // 2. Merge brand-doctor.config.json or Site Profile snippets
  if (config) {
    if (config.site) {
      merged.meta.site_name = config.site.name || merged.meta.site_name;
      if (config.site.theme === 'light') {
         merged.colors = { 
           background: '#f8f8f8', 
           accent: '#c45142', 
           text_primary: '#1a1a1a', 
           text_secondary: '#4a4a4a',
           glow: '#c45142'
         };
      }
    }
    
    // Support either legacy "brand" or new "branding" schema
    const b = config.branding || config.brand;
    if (b) {
      if (b.colors) deepMerge(merged.colors, b.colors);
      if (b.typography) deepMerge(merged.typography, b.typography);
      if (b.visuals) deepMerge(merged.visuals, b.visuals);
      if (b.assets) deepMerge(merged.assets, b.assets);
      
      // Legacy mapping
      if (b.primary_logo) merged.assets.logo = b.primary_logo;
      if (b.accent) merged.colors.accent = b.accent;
    }

    if (config.defaults) deepMerge(merged.layout, config.defaults);
    if (config.paths?.og_output) merged.output.path = config.paths.og_output;
    if (config.rules) deepMerge(merged.rules, config.rules);
  }

  // 3. Merge CLI flags
  if (cli.title) merged.content.title = cli.title;
  if (cli.subtitle) merged.content.subtitle = cli.subtitle;
  const eyebrowStr = cli.eyebrow || cli.badge;
  if (eyebrowStr) merged.content.eyebrow = eyebrowStr;
  if (cli.layout) merged.layout.mode = cli.layout;
  if (cli.theme) {
    if (cli.theme === 'light') {
      merged.colors = { background: '#f8f8f8', accent: '#c45142', text_primary: '#1a1a1a', text_secondary: '#4a4a4a', glow: '#c45142' };
    } else {
      merged.colors = { background: '#08080d', accent: '#c45142', text_primary: '#ffffff', text_secondary: '#a0a0b0', glow: '#c45142' };
    }
  }
  if (cli.output) merged.output.path = cli.output;
  if (cli.visuals) deepMerge(merged.visuals, cli.visuals);

  // 4. Merge Spec (wins over everything)
  if (spec) {
    deepMerge(merged, spec);
  }

  // Final normalization
  if (merged.content.badge) {
    merged.content.eyebrow = merged.content.badge;
    delete merged.content.badge;
  }

  return merged;
}

/**
 * Merges defaults, config, CLI, and spec for Icons.
 */
export function mergeIconConfigAndSpec(config, spec, cli = {}) {
  const defaults = {
    version: 1,
    type: 'icons',
    assets: { source: '' },
    output: { dir: 'public/assets/icons' },
    targets: {
      favicon_png: [16, 32],
      favicon_ico: [16, 32, 48, 64],
      apple_touch: [180],
      generic: [192, 512],
      maskable: [192, 512]
    }
  };

  let merged = JSON.parse(JSON.stringify(defaults));

  if (config) {
    if (config.brand?.primary_logo) merged.assets.source = config.brand.primary_logo;
    if (config.paths?.icon_output_dir) merged.output.dir = config.paths.icon_output_dir;
  }

  if (cli.source) merged.assets.source = cli.source;
  if (cli.outputDir) merged.output.dir = cli.outputDir;

  if (spec) {
    deepMerge(merged, spec);
  }

  return merged;
}
