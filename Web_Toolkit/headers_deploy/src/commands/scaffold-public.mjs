// ./Web_Toolkit/headers_deploy/src/commands/scaffold-public.mjs
/**
 * Writes or updates the managed cache baseline in public/_headers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { toBool } from '../lib/cli.mjs';
import {
  resolveHeadersConfig,
  resolveProfile,
  resolveProjectRoot,
  resolvePublicHeadersPath,
} from '../lib/paths.mjs';
import { buildPublicCacheBaseline, upsertManagedBlock } from '../lib/zenith-baseline.mjs';

export async function runScaffoldPublic(flags = {}) {
  const resolved = flags['site-profile'] || flags.profile ? resolveProfile(flags) : null;
  const projectRoot = resolveProjectRoot(flags, resolved);
  const headersConfig = resolveHeadersConfig(resolved?.profile || {});
  const headersPath = resolvePublicHeadersPath(projectRoot);
  const apply = toBool(flags.apply, false);

  const before = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8') : '';
  const blockBody = buildPublicCacheBaseline(headersConfig);
  const after = upsertManagedBlock(before, blockBody);
  const changed = before !== after;

  console.log('\nHeaders deploy: scaffold public/_headers cache baseline');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Headers file: ${headersPath}`);
  console.log(`- CSP preset: ${headersConfig.preset}`);
  console.log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);
  console.log(`- Would change: ${changed ? 'yes' : 'no'}`);

  if (!changed) return 0;
  if (!apply) {
    console.log('- Proposed managed block:');
    console.log(blockBody);
    return 0;
  }

  fs.mkdirSync(path.dirname(headersPath), { recursive: true });
  fs.writeFileSync(headersPath, after, 'utf8');
  console.log('- Updated public/_headers with managed cache baseline.');
  return 0;
}
