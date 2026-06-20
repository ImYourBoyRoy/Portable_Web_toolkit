// ./Web_Toolkit/performance_fixes/src/commands/immutable-cache.mjs
/**
 * Creates or updates a public/_headers file with long-lived immutable caching
 * for hashed Astro asset bundles.
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';

const BLOCK_START = '# portable-performance-fixes: immutable-cache:start';
const BLOCK_END = '# portable-performance-fixes: immutable-cache:end';
const BLOCK_BODY = [
  BLOCK_START,
  '/_astro/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  BLOCK_END
].join('\n');

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function nextContent(current = '') {
  const value = String(current || '').trim();
  if (!value) return `${BLOCK_BODY}\n`;
  const pattern = new RegExp(`${BLOCK_START}[\\s\\S]*?${BLOCK_END}\\n?`, 'm');
  if (pattern.test(value)) {
    return `${value.replace(pattern, BLOCK_BODY).trim()}\n`;
  }
  return `${value}\n\n${BLOCK_BODY}\n`;
}

export async function runImmutableCache(flags = {}) {
  const resolved = flags['site-profile'] || flags.profile ? resolveProfile(flags) : null;
  const projectRoot = resolveProjectRoot(flags, resolved);
  const headersPath = path.join(projectRoot, 'public', '_headers');
  const before = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8') : '';
  const after = nextContent(before);
  const apply = toBool(flags.apply, false);
  const changed = before !== after;

  console.log('\nPerformance fix: immutable cache headers');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Headers file: ${headersPath}`);
  console.log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);
  console.log(`- Would change: ${changed ? 'yes' : 'no'}`);

  if (!changed) return 0;
  if (!apply) {
    console.log('- Proposed block:');
    console.log(BLOCK_BODY);
    return 0;
  }

  fs.mkdirSync(path.dirname(headersPath), { recursive: true });
  fs.writeFileSync(headersPath, after, 'utf8');
  console.log('- Updated public/_headers with immutable /_astro/* cache policy.');
  return 0;
}

