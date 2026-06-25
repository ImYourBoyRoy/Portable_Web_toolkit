// ./scripts/build-headers.mjs
/**
 * Deploy-time `_headers` generation via the portable Web Toolkit.
 * Requires Web_Toolkit linked at the project root.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const environment = String(process.argv[2] || 'production').toLowerCase();

const toolkitCandidates = [
  process.env.WEB_TOOLKIT_ROOT,
  path.resolve(projectRoot, 'Web_Toolkit'),
  path.resolve(projectRoot, 'web_toolkit'),
  path.resolve(projectRoot, '../Portable_Web_toolkit/Web_Toolkit'),
].filter(Boolean);

const toolkitRoot = toolkitCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'headers_deploy', 'bin', 'headers-deploy.mjs')),
);

if (!toolkitRoot) {
  console.error('Could not locate Web Toolkit headers-deploy. Link Web_Toolkit or set WEB_TOOLKIT_ROOT.');
  process.exit(1);
}

const cliPath = path.join(toolkitRoot, 'headers_deploy', 'bin', 'headers-deploy.mjs');
const result = spawnSync(
  process.execPath,
  [cliPath, 'write-deploy', '--project-root', projectRoot, '--environment', environment],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
