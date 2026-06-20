// ./src/lib/schema.mjs
/**
 * Schema Validation for Brand Doctor.
 * Validates brand-doctor.config.json and *.spec.json files.
 */

/**
 * Validates the raw brand-doctor.config.json object.
 */
export function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') throw new Error("Invalid config object");
  
  if (config.version !== 1) errors.push("Unsupported config version. Expected 1.");
  
  // Validate site
  if (config.site) {
    if (config.site.theme && !['dark', 'light'].includes(config.site.theme)) {
      errors.push(`Invalid theme: ${config.site.theme}`);
    }
  }

  // Validate typography
  if (config.typography) {
    const fonts = ['title_font', 'subtitle_font', 'body_font', 'eyebrow_font'];
    for (const f of fonts) {
      if (config.typography[f] && typeof config.typography[f] !== 'object') {
        errors.push(`Typography ${f} must be an object`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a raw OG spec object.
 */
export function validateOgSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') throw new Error("Invalid spec object");
  
  if (spec.type !== 'open_graph') errors.push("Spec type must be 'open_graph'");
  
  if (spec.layout) {
    const validModes = ['master-polish-5.5', 'auto', 'split', 'portrait-right', 'logo-focus', 'minimal', 'text-only', 'image-led'];
    if (spec.layout.mode && !validModes.includes(spec.layout.mode)) {
      errors.push(`Invalid layout mode: ${spec.layout.mode}`);
    }
    const validAlign = ['left', 'center', 'right'];
    if (spec.layout.alignment && !validAlign.includes(spec.layout.alignment)) {
      errors.push(`Invalid alignment: ${spec.layout.alignment}`);
    }
  }

  if (spec.visuals) {
    if (typeof spec.visuals !== 'object') errors.push("visuals must be an object");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a raw Icon spec object.
 */
export function validateIconSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') throw new Error("Invalid spec object");
  
  if (spec.type !== 'icons') errors.push("Spec type must be 'icons'");
  
  if (spec.targets) {
    for (const [group, sizes] of Object.entries(spec.targets)) {
      if (!Array.isArray(sizes)) {
        errors.push(`Icon target group '${group}' must be an array of numbers`);
      } else if (sizes.some(s => typeof s !== 'number' || s <= 0)) {
        errors.push(`Icon targets for '${group}' must be positive integers`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates the resolved merged spec (the final object sent to the renderer).
 */
export function validateResolvedSpec(spec) {
  const errors = [];
  
  if (spec.type === 'open_graph') {
    if (!spec.content?.title) errors.push("Resolved OG spec must have a title");
    if (!spec.output?.path) errors.push("Resolved OG spec must have an output path");
  } else if (spec.type === 'icons') {
    if (!spec.assets?.source) errors.push("Resolved Icon spec must have a source asset");
    if (!spec.output?.dir) errors.push("Resolved Icon spec must have an output directory");
  }

  return { valid: errors.length === 0, errors };
}
