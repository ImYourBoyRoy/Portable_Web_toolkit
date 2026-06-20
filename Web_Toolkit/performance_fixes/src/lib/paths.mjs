// ./Web_Toolkit/performance_fixes/src/lib/paths.mjs
/**
 * Path helpers for performance-fixes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolvePortableRoot, loadSiteProfileContext } from '../../../shared/lib/context.mjs';

export const TOOL_ROOT = path.resolve(resolvePortableRoot(import.meta.url, 3), 'performance_fixes');
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

export function latestReport(projectRoot, prefix) {
  const outputDir = path.join(projectRoot, 'output');
  if (!fs.existsSync(outputDir)) return '';
  const files = fs.readdirSync(outputDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .map((name) => path.join(outputDir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return files[0] || '';
}

export function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

