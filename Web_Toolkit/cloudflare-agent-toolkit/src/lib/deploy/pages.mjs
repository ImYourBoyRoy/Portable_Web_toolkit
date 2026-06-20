// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/deploy/pages.mjs
/** Deploy Astro dist/client to Cloudflare Pages. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  loadDeployContext,
  resolvePagesProjectName,
} from './context.mjs';

function ensurePagesProject(projectName, deployEnv) {
  const list = spawnSync(
    'npx',
    ['wrangler', 'pages', 'project', 'list'],
    { encoding: 'utf8', shell: process.platform === 'win32', env: deployEnv },
  );
  if (list.stdout?.includes(projectName)) return;

  console.log(`- Creating Pages project: ${projectName}`);
  spawnSync(
    'npx',
    ['wrangler', 'pages', 'project', 'create', projectName, '--production-branch', 'main'],
    { stdio: 'inherit', shell: process.platform === 'win32', env: deployEnv },
  );
}

export function deployPagesToCloudflare({ projectRoot, projectName, deployEnv }) {
  const clientDir = path.join(projectRoot, 'dist', 'client');
  if (!fs.existsSync(clientDir)) {
    throw new Error(`Missing ${clientDir}. Run npm run build first.`);
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-pages-deploy-'));
  fs.cpSync(clientDir, stagingDir, { recursive: true });
  console.log(`- Pages asset staging: ${stagingDir}`);

  ensurePagesProject(projectName, deployEnv);

  const result = spawnSync(
    'npx',
    ['wrangler', 'pages', 'deploy', '.', '--project-name', projectName, '--commit-dirty=true'],
    { cwd: stagingDir, stdio: 'inherit', shell: process.platform === 'win32', env: deployEnv },
  );

  fs.rmSync(stagingDir, { recursive: true, force: true });
  return result;
}

export function runDeployPages(flags = {}) {
  const { profilePath, profile, projectRoot, deployEnv } = loadDeployContext(flags);
  const projectName = resolvePagesProjectName(flags, profile, projectRoot);

  console.log('\n[cf-deploy-pages]');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Site profile: ${profilePath || '(none)'}`);
  console.log(`- Pages project: ${projectName}`);
  console.log(`- Preview URL: https://${projectName}.pages.dev`);

  const result = deployPagesToCloudflare({ projectRoot, projectName, deployEnv });
  return typeof result.status === 'number' ? result.status : 1;
}
