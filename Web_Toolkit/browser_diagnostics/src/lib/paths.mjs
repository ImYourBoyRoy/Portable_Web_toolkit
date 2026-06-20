// ./Web_Toolkit/browser_diagnostics/src/lib/paths.mjs
/**
 * Path/profile helpers for browser-diagnostics.
 */

import path from 'node:path';
import { resolvePortableRoot, loadSiteProfileContext } from '../../../shared/lib/context.mjs';

export const TOOL_ROOT = path.resolve(resolvePortableRoot(import.meta.url, 3), 'browser_diagnostics');
export const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);

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
  const artifactRoot = path.join(outputDir, `browser-diagnostics-${siteId}-${stamp}`);
  return {
    outputDir,
    jsonPath: `${artifactRoot}.json`,
    mdPath: `${artifactRoot}.md`,
    pythonJsonPath: `${artifactRoot}.raw.json`,
    screenshotsDir: `${artifactRoot}-screenshots`,
    lighthouseJsonPath: `${artifactRoot}.lighthouse.json`,
    tempConfigPath: `${artifactRoot}.config.json`,
    stamp
  };
}

