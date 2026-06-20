// ./scripts/clean-local-cache.mjs
/**
 * Utility to safely clear Astro and build artifacts.
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

console.log('\u001b[36m[clean-local-cache]\u001b[0m Starting cleanup...');

try {
  for (const p of pathsToClean) {
    console.log(`- Removing: ${p}`);
    await rimraf(p);
  }
  console.log('\u001b[32m[SUCCESS]\u001b[0m Environment cleared.');
} catch (err) {
  console.error(`\u001b[31m[FAILED]\u001b[0m ${err.message}`);
  process.exit(1);
}
