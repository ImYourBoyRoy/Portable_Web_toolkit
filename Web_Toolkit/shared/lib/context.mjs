// ./Web_Toolkit/shared/lib/context.mjs
/**
 * Shared portable root, runtime, profile, and project-env helpers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, mergeEnvFiles } from './env.mjs';
import { assertSafeProjectRoot, assertValidSiteProfile } from './site-profile.mjs';

function uniquePaths(paths = []) {
  return [...new Set(paths.filter(Boolean).map((entry) => path.resolve(entry)))];
}

function existingPath(candidates = []) {
  return uniquePaths(candidates).find((entry) => fs.existsSync(entry)) || '';
}

export function resolvePortableRoot(importMetaUrl, levelsFromFile = 2) {
  const filePath = fileURLToPath(importMetaUrl);
  return path.resolve(path.dirname(filePath), ...Array.from({ length: levelsFromFile }, () => '..'));
}

export function portableEnvPath(portableRoot) {
  return path.join(portableRoot, '.env');
}

export function loadPortableEnv(portableRoot) {
  return mergeEnvFiles(portableEnvPath(portableRoot));
}

export function resolveRuntimeRoot(portableRoot) {
  const env = loadPortableEnv(portableRoot);
  const configured = String(env.PORTABLE_RUNTIME_DIR || '.runtime').trim();
  if (!configured) return path.join(portableRoot, '.runtime');
  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(portableRoot, configured);
}

export function resolveRuntimePath(portableRoot, ...parts) {
  return path.join(resolveRuntimeRoot(portableRoot), ...parts);
}

export function resolveSiteProfilePath({ portableRoot, flags = {}, requireProfile = true } = {}) {
  const env = loadPortableEnv(portableRoot);
  const explicit = String(flags['site-profile'] || flags.profile || env.PORTABLE_DEFAULT_PROFILE || '').trim();
  if (!explicit) {
    if (requireProfile) {
      throw new Error('Missing --site-profile (or PORTABLE_DEFAULT_PROFILE in Web_Toolkit/.env or the shell environment). Project .env is read after a profile/project root is resolved.');
    }
    return '';
  }

  const candidates = [
    path.resolve(process.cwd(), explicit),
    path.resolve(portableRoot, explicit),
    path.resolve(portableRoot, 'site-profiles', explicit),
    path.resolve(portableRoot, '..', 'Private_Site_Profiles', explicit),
    path.resolve(process.cwd(), 'Private_Site_Profiles', explicit)
  ];
  const resolved = existingPath(candidates);
  if (resolved) return resolved;
  if (requireProfile) {
    throw new Error(`Site profile not found: ${explicit}`);
  }
  return '';
}

export function resolveProjectRoot({ portableRoot, flags = {}, profile = null, profilePath = '' } = {}) {
  const explicit = String(flags['project-root'] || '').trim();
  if (explicit) return path.resolve(explicit);

  const rawProfileRoot = String(profile?.projectRoot || '').trim();
  if (rawProfileRoot) {
    const baseDir = profilePath ? path.dirname(profilePath) : process.cwd();
    return path.isAbsolute(rawProfileRoot)
      ? path.resolve(rawProfileRoot)
      : path.resolve(baseDir, rawProfileRoot);
  }

  const env = loadPortableEnv(portableRoot);
  const envRoot = String(env.PORTABLE_DEFAULT_PROJECT_ROOT || '').trim();
  if (envRoot) return path.resolve(envRoot);
  return process.cwd();
}

export function resolveProjectEnv(projectRoot, portableRoot, ...extraPaths) {
  return mergeEnvFiles(
    portableEnvPath(portableRoot),
    path.join(projectRoot, '.env'),
    extraPaths
  );
}

export function loadSiteProfileContext({ portableRoot, flags = {}, requireProfile = true, validateProfile = true } = {}) {
  const profilePath = resolveSiteProfilePath({ portableRoot, flags, requireProfile });
  let profile = profilePath ? JSON.parse(fs.readFileSync(profilePath, 'utf8')) : null;
  if (profile && validateProfile) {
    profile = assertValidSiteProfile(profile);
  }
  const projectRoot = assertSafeProjectRoot(
    resolveProjectRoot({ portableRoot, flags, profile, profilePath }),
    { requireProjectMarker: Boolean(profile), allowMissing: !String(flags['project-root'] || '').trim() }
  );
  const portableEnv = loadEnvFile(portableEnvPath(portableRoot));
  const projectEnv = loadEnvFile(path.join(projectRoot, '.env'));
  const env = { ...portableEnv, ...projectEnv, ...process.env };

  return {
    portableRoot,
    profilePath,
    profile,
    projectRoot,
    portableEnv,
    projectEnv,
    env,
    zoneName: String(flags.zone || profile?.zone?.name || '').trim(),
    productionHosts: Array.isArray(profile?.hosts?.production) ? profile.hosts.production : [],
    developmentHosts: Array.isArray(profile?.hosts?.development) ? profile.hosts.development : [],
    deployTarget: String(profile?.deployTarget || 'workers').trim().toLowerCase()
  };
}

