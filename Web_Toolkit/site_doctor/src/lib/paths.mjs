// ./Web_Toolkit/site_doctor/src/lib/paths.mjs
/**
 * Shared path helpers for the portable site doctor tool.
 */

import path from 'node:path';
import { loadEnvFile } from '../../../shared/lib/env.mjs';
import { resolvePortableRoot, loadSiteProfileContext } from '../../../shared/lib/context.mjs';

export const SITE_DOCTOR_ROOT = path.resolve(resolvePortableRoot(import.meta.url, 3), 'site_doctor');
export const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);

export function portableEnv() {
  return loadEnvFile(path.join(PORTABLE_ROOT, '.env'));
}

export function resolveSiteProfilePath(flags = {}) {
  return loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags }).profilePath;
}

export function loadSiteProfile(flags = {}) {
  const resolved = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags });
  return {
    path: resolved.profilePath,
    profile: resolved.profile,
    projectRoot: resolved.projectRoot
  };
}

export function resolveProjectRoot(flags = {}) {
  if (flags['project-root']) return path.resolve(String(flags['project-root']));
  return loadSiteProfile(flags).projectRoot;
}

