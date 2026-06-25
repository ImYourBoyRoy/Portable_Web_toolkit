// ./Web_Toolkit/headers_deploy/src/lib/paths.mjs
/**
 * Resolves project roots and deploy header paths from CLI flags or site profiles.
 */

import path from 'node:path';
import { resolvePortableRoot, loadSiteProfileContext } from '../../../shared/lib/context.mjs';

export const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);

export function resolveProfile(flags = {}) {
  const resolved = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags });
  return {
    profilePath: resolved.profilePath,
    profile: resolved.profile,
    projectRoot: resolved.projectRoot,
  };
}

export function resolveProjectRoot(flags = {}, resolved = null) {
  if (flags['project-root']) return path.resolve(String(flags['project-root']));
  if (resolved?.projectRoot) return path.resolve(resolved.projectRoot);
  return loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags }).projectRoot;
}

export function resolveHeadersConfig(profile = {}) {
  const cloudflare = profile.cloudflare || {};
  const headers = cloudflare.headers || {};
  const deployTarget = profile.deployTarget || 'workers';
  const distSubdir = headers.distSubdir
    ?? (deployTarget === 'workers' ? 'client' : '');

  return {
    preset: headers.preset || 'astro-static',
    distSubdir: String(distSubdir).replace(/^\/+|\/+$/g, ''),
    developmentNoIndex: headers.developmentNoIndex !== false,
    hstsMaxAge: Number(headers.hstsMaxAge || 31536000),
    includeSubdomains: headers.includeSubdomains !== false,
    preloadHsts: headers.preloadHsts === true,
    ogImagePath: headers.ogImagePath || '/assets/og-image.png',
    csp: headers.csp || {},
  };
}

export function resolvePublicHeadersPath(projectRoot) {
  return path.join(projectRoot, 'public', '_headers');
}

export function resolveDistHeadersPath(projectRoot, headersConfig) {
  const distRoot = path.join(projectRoot, 'dist');
  if (!headersConfig.distSubdir) return path.join(distRoot, '_headers');
  return path.join(distRoot, headersConfig.distSubdir, '_headers');
}

export function resolveDistRoot(projectRoot, headersConfig) {
  const distRoot = path.join(projectRoot, 'dist');
  if (!headersConfig.distSubdir) return distRoot;
  return path.join(distRoot, headersConfig.distSubdir);
}
