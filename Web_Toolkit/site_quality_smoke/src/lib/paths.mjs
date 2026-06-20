// ./Web_Toolkit/site_quality_smoke/src/lib/paths.mjs
/**
 * Shared path/profile helpers for site-quality-smoke.
 */

import path from 'node:path';
import { resolvePortableRoot, loadSiteProfileContext } from '../../../shared/lib/context.mjs';

export const TOOL_ROOT = path.resolve(resolvePortableRoot(import.meta.url, 3), 'site_quality_smoke');
export const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);

export function resolveProfile(flags = {}) {
  const resolved = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags });
  return {
    profilePath: resolved.profilePath,
    profile: resolved.profile,
    projectRoot: resolved.projectRoot
  };
}

export function resolveProjectRoot(flags = {}, profile = null) {
  if (flags['project-root']) return path.resolve(String(flags['project-root']));
  if (profile?.projectRoot) return path.resolve(profile.projectRoot);
  return loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags }).projectRoot;
}

