// ./Web_Toolkit/Setup_astro_environment/src/lib/paths.mjs
/**
 * Path helpers for the portable Astro environment setup tool.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TOOL_ROOT = path.resolve(__dirname, '..', '..');
export const PORTABLE_ROOT = path.resolve(TOOL_ROOT, '..');

