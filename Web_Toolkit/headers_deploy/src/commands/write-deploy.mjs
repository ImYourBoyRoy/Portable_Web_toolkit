// ./Web_Toolkit/headers_deploy/src/commands/write-deploy.mjs
/**
 * Merges security headers and public/_headers into the built dist output.
 */

import fs from 'node:fs';
import path from 'node:path';
import { toBool } from '../lib/cli.mjs';
import {
  resolveDistHeadersPath,
  resolveHeadersConfig,
  resolveProfile,
  resolveProjectRoot,
  resolvePublicHeadersPath,
} from '../lib/paths.mjs';
import { buildDeploySecurityBlock } from '../lib/zenith-baseline.mjs';

function readOptionalFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8').trim();
}

export async function runWriteDeploy(flags = {}) {
  const resolved = flags['site-profile'] || flags.profile ? resolveProfile(flags) : null;
  const projectRoot = resolveProjectRoot(flags, resolved);
  const headersConfig = resolveHeadersConfig(resolved?.profile || {});
  const environment = String(flags.environment || flags.env || 'production').toLowerCase();
  const apply = toBool(flags.apply, true);

  const publicHeadersPath = resolvePublicHeadersPath(projectRoot);
  const distHeadersPath = resolveDistHeadersPath(projectRoot, headersConfig);
  const securityBlock = buildDeploySecurityBlock({ environment, headersConfig }).trim();
  const publicBlock = readOptionalFile(publicHeadersPath);
  const finalHeaders = [securityBlock, publicBlock].filter(Boolean).join('\n\n') + '\n';

  console.log('\nHeaders deploy: write dist _headers');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Environment: ${environment}`);
  console.log(`- Output: ${distHeadersPath}`);
  console.log(`- CSP preset: ${headersConfig.preset}`);
  console.log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);

  if (!apply) {
    console.log('- Proposed output preview:');
    console.log(finalHeaders.slice(0, 1200));
    if (finalHeaders.length > 1200) console.log('…');
    return 0;
  }

  fs.mkdirSync(path.dirname(distHeadersPath), { recursive: true });
  fs.writeFileSync(distHeadersPath, finalHeaders, 'utf8');
  console.log(`- Wrote ${path.relative(projectRoot, distHeadersPath)}`);
  return 0;
}
