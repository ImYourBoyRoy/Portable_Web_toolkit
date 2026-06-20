// ./Web_Toolkit/pagespeed_diagnostics/src/lib/paths.mjs
/**
 * Path/env/profile helpers for pagespeed-diagnostics.
 */

import path from 'node:path';
import { loadEnvFile } from '../../../shared/lib/env.mjs';
import { resolvePortableRoot, loadSiteProfileContext } from '../../../shared/lib/context.mjs';

export const TOOL_ROOT = path.resolve(resolvePortableRoot(import.meta.url, 3), 'pagespeed_diagnostics');
export const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);

export function loadEnv(envPath) {
  return loadEnvFile(envPath);
}

export function resolveProfile(flags = {}) {
  const resolved = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags });
  return {
    profilePath: resolved.profilePath,
    profile: resolved.profile,
    projectRoot: resolved.projectRoot
  };
}

export function resolveProjectRoot(flags = {}, resolved = null) {
  if (flags['project-root']) return path.resolve(String(flags['project-root']));
  if (resolved?.projectRoot) return path.resolve(resolved.projectRoot);
  return loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags }).projectRoot;
}

export function outputPaths(projectRoot, siteId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(projectRoot, 'output');
  return {
    outputDir,
    jsonPath: path.join(outputDir, `pagespeed-diagnostics-${siteId}-${stamp}.json`),
    mdPath: path.join(outputDir, `pagespeed-diagnostics-${siteId}-${stamp}.md`)
  };
}

