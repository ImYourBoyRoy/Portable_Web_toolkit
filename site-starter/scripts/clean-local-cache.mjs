// ./scripts/clean-local-cache.mjs
/**
 * Clear Astro and Vite build caches without removing node_modules.
 */

import { rimraf } from 'rimraf';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

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
  console.error(`[clean-local-cache] Failed: ${error.message}`);
  process.exit(1);
}
