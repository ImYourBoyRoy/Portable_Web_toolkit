// ./Web_Toolkit/image_pipeline/src/lib/paths.mjs
/**
 * Path helpers for image-pipeline.
 */

import path from 'node:path';
import { resolvePortableRoot, loadSiteProfileContext } from '../../../shared/lib/context.mjs';

export const TOOL_ROOT = path.resolve(resolvePortableRoot(import.meta.url, 3), 'image_pipeline');
export const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);

export function resolveProfile(flags = {}) {
  const resolved = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags, requireProfile: false });
  if (!resolved.profile) return null;
  return {
    profilePath: resolved.profilePath,
    profile: resolved.profile,
    projectRoot: resolved.projectRoot
  };
}

export function resolveProjectRoot(flags = {}, resolved = null) {
  if (flags['project-root']) return path.resolve(String(flags['project-root']));
  if (resolved?.projectRoot) return path.resolve(resolved.projectRoot);
  return loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags, requireProfile: false }).projectRoot;
}

export function outputPaths(projectRoot, label = 'image-pipeline') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(projectRoot, 'output');
  return {
    outputDir,
    jsonPath: path.join(outputDir, `${label}-${stamp}.json`),
    mdPath: path.join(outputDir, `${label}-${stamp}.md`),
    tempPath: path.join(outputDir, `${label}-${stamp}.tmp.json`)
  };
}

