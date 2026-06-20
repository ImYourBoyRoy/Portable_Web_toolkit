// ./Web_Toolkit/Setup_astro_environment/src/lib/profile.mjs
/**
 * Site profile loading helpers for portable setup workflows.
 */

import fs from 'node:fs';
import { loadSiteProfileContext, resolvePortableRoot, resolveSiteProfilePath as resolveSiteProfilePathFromShared } from '../../../shared/lib/context.mjs';

const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);

export function resolveProfilePath(flags = {}) {
  return resolveSiteProfilePathFromShared({ portableRoot: PORTABLE_ROOT, flags, requireProfile: false });
}

export function loadProfile(profilePath) {
  if (!profilePath) return null;
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Site profile not found: ${profilePath}`);
  }
  return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
}

export function loadProfileContext(flags = {}) {
  return loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags, requireProfile: false });
}

