// ./Web_Toolkit/image_pipeline/src/lib/astro-posture.mjs
/**
 * Detect whether a project follows Astro Image / Picture defaults vs public/ dumps.
 */

import fs from 'node:fs';
import path from 'node:path';

const ASTRO_CONFIG_NAMES = ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.cjs'];

export function findAstroConfig(projectRoot) {
  for (const name of ASTRO_CONFIG_NAMES) {
    const full = path.join(projectRoot, name);
    if (fs.existsSync(full)) return full;
  }
  return '';
}

function walkAstroFiles(root, limit = 400) {
  const out = [];
  const queue = [root];
  while (queue.length && out.length < limit) {
    const current = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', '.git', '.astro', 'output', '.runtime'].includes(entry.name)) continue;
        queue.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.astro')) {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * @param {string} projectRoot
 * @param {{ deployTarget?: string }} [options]
 */
export function analyzeAstroImagePosture(projectRoot, options = {}) {
  const root = path.resolve(projectRoot);
  const issues = [];
  const warnings = [];
  const notes = [];
  const configPath = findAstroConfig(root);
  let configText = '';
  let hasImageServiceCompile = false;
  let hasImageBlock = false;
  let hasPassthrough = false;

  if (!configPath) {
    issues.push('Missing astro.config.* — cannot enforce Astro image defaults.');
  } else {
    configText = fs.readFileSync(configPath, 'utf8');
    hasImageBlock = /\bimage\s*:\s*\{/.test(configText);
    hasImageServiceCompile = /imageService\s*:\s*['"]compile['"]/.test(configText);
    hasPassthrough = /passthroughImageService|imageService\s*:\s*['"]passthrough['"]/.test(configText);
    const deployTarget = String(options.deployTarget || '').toLowerCase();
    if (deployTarget === 'workers' || /@astrojs\/cloudflare|output\s*:\s*['"]server['"]/.test(configText)) {
      if (!hasImageServiceCompile && !/imageService\s*:\s*['"]cloudflare['"]/.test(configText)) {
        issues.push(
          'Workers/SSR config should set cloudflare({ imageService: \'compile\' }) (or \'cloudflare\') so Astro Image works.'
        );
      }
    }
    if (hasPassthrough) {
      warnings.push('passthrough image service disables Sharp optimization — prefer compile/Sharp for toolkit sites.');
    }
    if (!hasImageBlock) {
      warnings.push('astro.config has no image: { … } block — add domains/remotePatterns even if empty (starter default).');
    } else {
      notes.push('astro.config image block present');
    }
    if (hasImageServiceCompile) notes.push('cloudflare imageService: compile');
  }

  const optimizedPicture = path.join(root, 'src', 'components', 'OptimizedPicture.astro');
  const hasOptimizedPicture = fs.existsSync(optimizedPicture);
  if (!hasOptimizedPicture) {
    warnings.push(
      'Missing src/components/OptimizedPicture.astro — copy from site-starter for default AVIF+WebP Picture usage.'
    );
  } else {
    notes.push('OptimizedPicture.astro present');
  }

  let astroAssetsImports = 0;
  let barePublicJpgPng = 0;
  const srcDir = path.join(root, 'src');
  if (fs.existsSync(srcDir)) {
    for (const file of walkAstroFiles(srcDir)) {
      const text = fs.readFileSync(file, 'utf8');
      if (/from\s+['"]astro:assets['"]/.test(text) || /import\s*\{\s*[^}]*(Image|Picture)/.test(text)) {
        astroAssetsImports += 1;
      }
      if (/<img\b[^>]*src=["'][^"']*\.(?:jpe?g|png)(?:\?[^"']*)?["']/i.test(text)) {
        barePublicJpgPng += 1;
      }
    }
  }
  if (astroAssetsImports === 0 && fs.existsSync(srcDir)) {
    warnings.push(
      'No astro:assets Image/Picture imports found under src/ — prefer Astro Image for content photos.'
    );
  } else if (astroAssetsImports > 0) {
    notes.push(`astro:assets usage in ${astroAssetsImports} .astro file(s)`);
  }
  if (barePublicJpgPng > 0) {
    warnings.push(
      `${barePublicJpgPng} bare <img> JPG/PNG reference(s) in .astro — migrate content photos to Image/Picture; leave public/ leftovers to image-pipeline.`
    );
  }

  const publicDir = path.join(root, 'public');
  let publicRasters = 0;
  if (fs.existsSync(publicDir)) {
    const queue = [publicDir];
    while (queue.length) {
      const current = queue.shift();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (['assets/icons', 'favicons'].some((p) => full.replace(/\\/g, '/').includes(p))) continue;
          queue.push(full);
        } else if (/\.(jpe?g|png)$/i.test(entry.name) && !/og|favicon|apple-touch|icon/i.test(entry.name)) {
          publicRasters += 1;
        }
      }
    }
  }
  if (publicRasters > 0) {
    notes.push(
      `${publicRasters} JPG/PNG under public/ (non-icon) — use image-pipeline audit/optimize for these gaps after Astro Image for src/assets.`
    );
  }

  const status = issues.length ? 'fail' : warnings.length ? 'warn' : 'pass';
  return {
    status,
    configPath: configPath ? path.relative(root, configPath).replace(/\\/g, '/') : '',
    hasImageServiceCompile,
    hasImageBlock,
    hasOptimizedPicture,
    astroAssetsImports,
    barePublicJpgPng,
    publicRasters,
    issues,
    warnings,
    notes
  };
}
