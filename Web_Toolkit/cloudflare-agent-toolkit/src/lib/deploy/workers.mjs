// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/deploy/workers.mjs
/** Deploy Astro dist/server Worker bundle via Wrangler. */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  loadDeployContext,
  readJson,
  resolveWorkerName,
  workersDevUrl,
} from './context.mjs';

function patchWorkerWrangler(projectRoot, workerName) {
  const wranglerJsonPath = path.join(projectRoot, 'dist', 'server', 'wrangler.json');
  if (!fs.existsSync(wranglerJsonPath)) return null;

  const payload = readJson(wranglerJsonPath);
  payload.name = workerName;
  delete payload.pages_build_output_dir;
  if (!payload.main) payload.main = 'entry.mjs';
  if (!payload.assets) payload.assets = { binding: 'ASSETS', directory: '../client' };
  fs.writeFileSync(wranglerJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return wranglerJsonPath;
}

function patchRootWrangler(projectRoot, workerName) {
  const wranglerJsoncPath = path.join(projectRoot, 'wrangler.jsonc');
  if (!fs.existsSync(wranglerJsoncPath)) return;

  const raw = fs.readFileSync(wranglerJsoncPath, 'utf8');
  if (/"name"\s*:\s*"[^"]+"/.test(raw)) {
    const next = raw.replace(/"name"\s*:\s*"[^"]+"/, `"name": "${workerName}"`);
    if (next !== raw) fs.writeFileSync(wranglerJsoncPath, next, 'utf8');
  }
}

export function deployWorkerToCloudflare({ projectRoot, workerName, deployEnv }) {
  patchRootWrangler(projectRoot, workerName);
  const wranglerConfig = patchWorkerWrangler(projectRoot, workerName);
  if (!wranglerConfig) {
    throw new Error('Missing dist/server/wrangler.json — run npm run build first.');
  }

  return spawnSync('npx', ['wrangler', 'deploy', '--config', wranglerConfig], {
    cwd: path.dirname(wranglerConfig),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: deployEnv,
  });
}

export function runDeployWorkers(flags = {}) {
  const { profilePath, profile, projectRoot, deployEnv } = loadDeployContext(flags);
  const workerName = resolveWorkerName(flags, profile, projectRoot);
  const configuredSubdomain = String(
    profile?.cloudflare?.workersDevSubdomain || process.env.CF_WORKERS_DEV_SUBDOMAIN || '',
  ).trim();

  console.log('\n[cf-deploy-workers]');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Site profile: ${profilePath || '(none)'}`);
  console.log(`- Worker name: ${workerName}`);
  if (configuredSubdomain) {
    console.log(`- Profile workers.dev URL: ${workersDevUrl(workerName, configuredSubdomain)}`);
  }
  console.log(
    '- workers.dev uses {worker}.{account-subdomain}.workers.dev — change the account subdomain in Cloudflare dashboard if DNS fails.',
  );

  const result = deployWorkerToCloudflare({ projectRoot, workerName, deployEnv });
  return typeof result.status === 'number' ? result.status : 1;
}
