// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/deploy/pages.mjs
/** Deploy Astro dist/client to Cloudflare Pages. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { binaryCommand, detectPackageManager } from '../../../../shared/lib/package-manager.mjs';
import { spawnSync } from 'node:child_process';
import { toBool } from '../format.mjs';
import {
  loadDeployContext,
  resolvePagesProjectName,
} from './context.mjs';

/** Wrangler through the site's package manager (npx for npm sites, pnpm exec for pnpm sites). */
function wranglerRunner(args, projectRoot = process.cwd()) {
  return binaryCommand(detectPackageManager(projectRoot).name, 'wrangler', args);
}

function ensurePagesProject(projectName, deployEnv) {
  const [bin, args] = wranglerRunner(['pages', 'project', 'list']);
  const list = spawnSync(
    bin,
    args,
    { encoding: 'utf8', shell: process.platform === 'win32', env: deployEnv },
  );
  if (list.stdout?.includes(projectName)) return;

  console.log(`- Creating Pages project: ${projectName}`);
  const [createBin, createArgs] = wranglerRunner(['pages', 'project', 'create', projectName, '--production-branch', 'main']);
  spawnSync(
    createBin,
    createArgs,
    { stdio: 'inherit', shell: process.platform === 'win32', env: deployEnv },
  );
}

export function deployPagesToCloudflare({ projectRoot, projectName, deployEnv }) {
  const clientDir = path.join(projectRoot, 'dist', 'client');
  if (!fs.existsSync(clientDir)) {
    throw new Error(`Missing ${clientDir}. Run the site build first (pnpm run build).`);
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-pages-deploy-'));
  fs.cpSync(clientDir, stagingDir, { recursive: true });
  console.log(`- Pages asset staging: ${stagingDir}`);

  ensurePagesProject(projectName, deployEnv);

  const [deployBin, deployArgs] = wranglerRunner(['pages', 'deploy', '.', '--project-name', projectName, '--commit-dirty=true'], projectRoot);
  const result = spawnSync(
    deployBin,
    deployArgs,
    { cwd: stagingDir, stdio: 'inherit', shell: process.platform === 'win32', env: deployEnv },
  );

  fs.rmSync(stagingDir, { recursive: true, force: true });
  return result;
}

export function runDeployPages(flags = {}) {
  const { profilePath, profile, projectRoot, deployEnv } = loadDeployContext(flags);
  const projectName = resolvePagesProjectName(flags, profile, projectRoot);
  const apply = toBool(flags.apply, false);
  const clientDir = path.join(projectRoot, 'dist', 'client');

  console.log('\n[cf-deploy-pages]');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Site profile: ${profilePath || '(none)'}`);
  console.log(`- Pages project: ${projectName}`);
  console.log(`- Preview URL: https://${projectName}.pages.dev`);
  console.log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);

  if (!fs.existsSync(clientDir)) {
    throw new Error(`Missing ${clientDir}. Run the site build first (pnpm run build).`);
  }

  if (!apply) {
    console.log(`- Asset source: ${clientDir}`);
    console.log('- Dry-run only. Re-run with --apply to deploy.');
    return 0;
  }

  const result = deployPagesToCloudflare({ projectRoot, projectName, deployEnv });
  return typeof result.status === 'number' ? result.status : 1;
}
