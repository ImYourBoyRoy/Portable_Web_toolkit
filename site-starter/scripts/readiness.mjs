// ./scripts/readiness.mjs
/**
 * Run-all site readiness pass via the portable Web Toolkit.
 * Sandbox-aware: skips network checks when offline; writes report to output/.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const toolkitCandidates = [
  process.env.WEB_TOOLKIT_ROOT,
  path.resolve(projectRoot, 'Web_Toolkit'),
  path.resolve(projectRoot, 'web_toolkit'),
  path.resolve(projectRoot, '../Portable_Web_toolkit/Web_Toolkit'),
].filter(Boolean);

const toolkitRoot = toolkitCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'site_readiness', 'bin', 'site-readiness.mjs')),
);

if (!toolkitRoot) {
  console.error('Could not locate Web Toolkit site-readiness. Link Web_Toolkit or set WEB_TOOLKIT_ROOT.');
  process.exit(1);
}

const cliPath = path.join(toolkitRoot, 'site_readiness', 'bin', 'site-readiness.mjs');
const args = ['run', '--project-root', projectRoot, ...process.argv.slice(2)];
const result = spawnSync(process.execPath, [cliPath, ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
