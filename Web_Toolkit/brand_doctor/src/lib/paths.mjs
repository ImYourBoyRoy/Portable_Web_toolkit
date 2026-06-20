// ./Web_Toolkit/brand_doctor/src/lib/paths.mjs
/**
 * Path helpers for brand-doctor.
 */

import path from 'node:path';
import fs from 'node:fs';
import { resolvePortableRoot, loadSiteProfileContext } from '../../../shared/lib/context.mjs';

export const TOOL_ROOT = path.resolve(resolvePortableRoot(import.meta.url, 3), 'brand_doctor');
export const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);

export function resolveProfile(flags = {}) {
  const resolved = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags, requireProfile: false });
  if (!resolved.profile) return null;
  return {
    profilePath: resolved.profilePath,
    profile: resolved.profile
  };
}

/**
 * Finds the "Site Root" by looking up for an astro.config.mjs or a package.json
 * that doesn't belong to the brand-doctor toolkit.
 */
export function findSiteRoot(startDir = process.cwd()) {
  let curr = path.resolve(startDir);
  while (curr !== path.dirname(curr)) {
    // Look for Astro config first as it's the strongest signal
    if (fs.existsSync(path.join(curr, 'astro.config.mjs'))) return curr;
    
    // Fallback to package.json check (if it's not our own)
    const pkgPath = path.join(curr, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        // If it's our own toolkit, ignore it and keep looking up
        if (pkg.name !== 'brand-doctor') return curr;
      } catch (e) {}
    }
    curr = path.dirname(curr);
  }
  return startDir; // Fallback to current if nothing found
}

export function resolveProjectRoot(flags = {}, resolved = null) {
  if (flags['project-root']) return path.resolve(String(flags['project-root']));
  if (resolved?.projectRoot) return path.resolve(resolved.projectRoot);
  
  // Default to finding the site root
  return findSiteRoot(process.cwd());
}

export function outputPaths(projectRoot, label = 'brand-doctor') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(projectRoot, 'output');
  return {
    outputDir,
    jsonPath: path.join(outputDir, `${label}-${stamp}.json`),
    mdPath: path.join(outputDir, `${label}-${stamp}.md`)
  };
}

