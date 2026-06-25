// ./Web_Toolkit/headers_deploy/src/commands/audit.mjs
/**
 * Audits public and dist `_headers` files against the Zenith security baseline.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  resolveHeadersConfig,
  resolveProfile,
  resolveProjectRoot,
  resolvePublicHeadersPath,
} from '../lib/paths.mjs';
import { auditHeadersContent, auditHeadersFile, auditDistTree } from '../lib/audit-lib.mjs';
import { MANAGED_PUBLIC_START } from '../lib/zenith-baseline.mjs';

export async function runAudit(flags = {}) {
  const resolved = flags['site-profile'] || flags.profile ? resolveProfile(flags) : null;
  const projectRoot = resolveProjectRoot(flags, resolved);
  const headersConfig = resolveHeadersConfig(resolved?.profile || {});
  const publicPath = resolvePublicHeadersPath(projectRoot);
  const distRoot = path.join(projectRoot, 'dist');

  console.log('\nHeaders deploy: audit');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Public file: ${publicPath}`);
  console.log(`- Dist root: ${distRoot}`);

  let exitCode = 0;

  if (!fs.existsSync(publicPath)) {
    console.warn('[WARN] public/_headers is missing. Run: headers-deploy scaffold-public --apply');
    exitCode = 1;
  } else {
    const publicContent = fs.readFileSync(publicPath, 'utf8');
    const hasManagedBlock = publicContent.includes(MANAGED_PUBLIC_START);
    console.log(`[${hasManagedBlock ? 'PASS' : 'WARN'}] Public cache baseline ${hasManagedBlock ? 'present' : 'missing managed block'}`);
    if (!hasManagedBlock) exitCode = 1;

    const publicSecurity = auditHeadersContent(publicContent);
    if (publicSecurity.present.includes('Content-Security-Policy')) {
      console.log('[INFO] CSP found in public/_headers. Prefer write-deploy to inject CSP at deploy time only.');
    }
  }

  const distResult = auditDistTree(distRoot);

  if (!distResult.filePath) {
    console.warn('[FAIL] dist _headers missing. Run build, then headers-deploy write-deploy.');
    return 1;
  }

  if (distResult.ok) {
    console.log(`[PASS] Deploy headers at ${distResult.filePath}`);
    for (const header of distResult.present) {
      console.log(`       ✓ ${header}`);
    }
  } else {
    console.warn(`[FAIL] Deploy headers incomplete at ${distResult.filePath}`);
    for (const header of distResult.missing) {
      console.warn(`       ✗ ${header}`);
    }
    exitCode = 1;
  }

  if (headersConfig.distSubdir) {
    console.log(`[INFO] distSubdir=${headersConfig.distSubdir}`);
  }

  return exitCode;
}
