#!/usr/bin/env node
// ./Web_Toolkit/scripts/clean-local-cache.mjs
/**
 * Clear Astro/Vite build caches in the target project (not node_modules).
 * Run from client project root: node ./Web_Toolkit/scripts/clean-local-cache.mjs
 */

import { rimraf } from 'rimraf';
import path from 'node:path';

const projectRoot = path.resolve(process.env.PROJECT_ROOT || process.cwd());
const pathsToClean = [
  path.join(projectRoot, '.astro'),
  path.join(projectRoot, 'dist'),
  path.join(projectRoot, 'node_modules/.vite'),
];

console.log('[clean-local-cache] Starting cleanup...');

try {
  for (const target of pathsToClean) {
    console.log(`- Removing: ${target}`);
    await rimraf(target);
  }
  console.log('[clean-local-cache] Done.');
} catch (error) {
  console.error(`[clean-local-cache] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
