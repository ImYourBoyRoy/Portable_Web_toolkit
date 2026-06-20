// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/deploy/context.mjs
/** Shared deploy context: site profile, project root, env, naming. */

import fs from 'node:fs';
import path from 'node:path';
import { mergeEnvFiles } from '../../../../shared/lib/env.mjs';
import { loadSiteProfile, resolveProfilePath } from '../profile.mjs';

export function parseDeployFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function resolveProjectRoot(flags, site) {
  const explicit = String(flags['project-root'] || '').trim();
  if (explicit) return path.resolve(process.cwd(), explicit);
  if (site?.projectRoot) return site.projectRoot;
  throw new Error('Could not resolve project root. Pass --project-root or set projectRoot in the site profile.');
}

export function loadDeployEnv(projectRoot) {
  const env = mergeEnvFiles(path.join(projectRoot, '.env'));
  if (!env.CLOUDFLARE_ACCOUNT_ID && env.CF_ACCOUNT_ID) {
    env.CLOUDFLARE_ACCOUNT_ID = env.CF_ACCOUNT_ID;
  }
  return env;
}

export function resolvePagesProjectName(flags, profile, projectRoot) {
  const explicit = String(flags['project-name'] || process.env.CF_PAGES_PROJECT || '').trim();
  if (explicit) return explicit;

  const fromProfile = String(profile?.cloudflare?.pagesProject || profile?.siteId || '').trim();
  if (fromProfile) return fromProfile;

  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = readJson(packageJsonPath);
    const name = String(pkg?.name || '').trim();
    if (name && !name.startsWith('@') && name !== '[PROJECT_NAME]') return name;
  }

  throw new Error(
    'Missing Pages project name. Set CF_PAGES_PROJECT, pass --project-name, or set cloudflare.pagesProject in the site profile.',
  );
}

export function resolveWorkerName(flags, profile, projectRoot) {
  const explicit = String(flags['project-name'] || process.env.CF_WORKER_NAME || '').trim();
  if (explicit) return explicit;

  const fromProfile = String(
    profile?.cloudflare?.workerNames?.production
      || profile?.cloudflare?.workerNames?.development
      || profile?.siteId
      || '',
  ).trim();
  if (fromProfile) return fromProfile;

  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = readJson(packageJsonPath);
    const name = String(pkg?.name || '').trim();
    if (name && !name.startsWith('@') && name !== '[PROJECT_NAME]') return name;
  }

  throw new Error(
    'Missing Worker name. Set CF_WORKER_NAME, pass --project-name, or set cloudflare.workerNames in the site profile.',
  );
}

export function workersDevUrl(workerName, subdomain) {
  return `https://${workerName}.${subdomain}.workers.dev`;
}

export function loadDeployContext(flags = {}) {
  const site = loadSiteProfile(flags);
  const projectRoot = resolveProjectRoot(flags, site);
  const deployEnv = loadDeployEnv(projectRoot);
  return {
    flags,
    profilePath: resolveProfilePath(flags),
    profile: site.profile,
    site,
    projectRoot,
    deployEnv,
  };
}
