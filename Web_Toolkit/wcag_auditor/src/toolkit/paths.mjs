// ./Web_Toolkit/wcag_auditor/src/toolkit/paths.mjs
/**
 * Path and site-profile helpers for the portable WCAG auditor bridge.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadSiteProfileContext, resolvePortableRoot, resolveRuntimePath } from '../../../shared/lib/context.mjs';
import { importCore, resolveCoreRoot } from './resolve-core.mjs';

export const TOOL_ROOT = path.resolve(resolvePortableRoot(import.meta.url, 3), 'wcag_auditor');
export const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);

export { importCore, resolveCoreRoot };

export function resolveProfile(flags = {}, { requireProfile = false } = {}) {
  if (!flags['site-profile'] && !flags.profile && !requireProfile) {
    return null;
  }
  const resolved = loadSiteProfileContext({
    portableRoot: PORTABLE_ROOT,
    flags,
    requireProfile
  });
  return {
    profilePath: resolved.profilePath,
    profile: resolved.profile,
    projectRoot: resolved.projectRoot
  };
}

export function resolveProjectRoot(flags = {}, resolved = null) {
  if (flags['project-root']) return path.resolve(String(flags['project-root']));
  if (resolved?.projectRoot) return path.resolve(resolved.projectRoot);
  if (flags['site-profile'] || flags.profile) {
    return loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags }).projectRoot;
  }
  return path.resolve(String(flags.cwd || process.cwd()));
}

export async function resolveConfigPath(projectRoot, flags = {}, profile = null) {
  if (flags.config) {
    return path.resolve(projectRoot, String(flags.config));
  }
  const profileConfig = String(profile?.diagnostics?.wcagAuditor?.config || '').trim();
  if (profileConfig) {
    const candidate = path.resolve(projectRoot, profileConfig);
    if (fs.existsSync(candidate)) return candidate;
  }
  const { api } = await importCore({ projectRoot });
  return api.findConfig(projectRoot);
}

export function outputPaths(projectRoot, siteId = 'site') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeId = String(siteId || 'site').replace(/[^\w.-]+/g, '-');
  const outputDir = path.join(projectRoot, 'output', `wcag-auditor-${safeId}-${stamp}`);
  return {
    stamp,
    outputDir,
    jsonPath: path.join(outputDir, 'wcag-audit.json'),
    sarifPath: path.join(outputDir, 'wcag-audit.sarif'),
    junitPath: path.join(outputDir, 'wcag-audit.junit.xml'),
    htmlPath: path.join(outputDir, 'wcag-audit.html'),
    mdPath: path.join(outputDir, 'wcag-audit.md'),
    ephemeralConfigPath: path.join(outputDir, 'wcag-auditor.ephemeral.config.mjs')
  };
}

export function toolkitRuntimePath(...parts) {
  return resolveRuntimePath(PORTABLE_ROOT, 'wcag-auditor', ...parts);
}
