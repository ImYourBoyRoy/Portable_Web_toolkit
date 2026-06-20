// ./Web_Toolkit/shared/lib/site-profile.mjs
/**
 * Site profile validation, deploy-command allowlisting, and project-root guards.
 */

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_ROOT_FIELDS = ['siteId', 'projectRoot', 'deployTarget', 'zone', 'hosts', 'commands', 'cloudflare'];
const ALLOWED_DEPLOY_TARGETS = new Set(['workers', 'pages']);
const ALLOWED_DEPLOY_PREFIXES = [
  /^npm run\b/i,
  /^npm ci\b/i,
  /^npx wrangler\b/i,
  /^wrangler\b/i,
  /^pnpm run\b/i,
  /^pnpm\b/i,
  /^yarn run\b/i,
  /^yarn\b/i,
  /^node scripts\//i,
  /^node \.\//i
];
const FORBIDDEN_SHELL_CHARS = /[;&|`$<>]|\|\||\r|\n/;

function pushError(errors, message) {
  errors.push(message);
}

export function validateDeployCommand(command, label = 'deploy command') {
  const value = String(command || '').trim();
  if (!value) return { ok: false, error: `Missing ${label}.` };
  if (FORBIDDEN_SHELL_CHARS.test(value)) {
    return { ok: false, error: `${label} contains forbidden shell metacharacters.` };
  }
  if (!ALLOWED_DEPLOY_PREFIXES.some((pattern) => pattern.test(value))) {
    return {
      ok: false,
      error: `${label} must start with an allowed runner (npm run, npx wrangler, wrangler, pnpm, yarn, or node ./scripts/).`
    };
  }
  return { ok: true, value };
}

export function validateSiteProfile(profile = {}) {
  const errors = [];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return { ok: false, errors: ['Site profile must be a JSON object.'] };
  }

  for (const field of REQUIRED_ROOT_FIELDS) {
    if (!(field in profile)) pushError(errors, `Missing required field: ${field}`);
  }

  if (profile.siteId !== undefined && !String(profile.siteId).trim()) {
    pushError(errors, 'siteId must be a non-empty string.');
  }

  if (profile.deployTarget !== undefined && !ALLOWED_DEPLOY_TARGETS.has(String(profile.deployTarget).trim().toLowerCase())) {
    pushError(errors, 'deployTarget must be "workers" or "pages".');
  }

  if (profile.zone !== undefined) {
    if (!profile.zone || typeof profile.zone !== 'object') {
      pushError(errors, 'zone must be an object.');
    } else if (!String(profile.zone.name || '').trim()) {
      pushError(errors, 'zone.name must be a non-empty string.');
    }
  }

  if (profile.hosts !== undefined) {
    if (!Array.isArray(profile.hosts?.production) || profile.hosts.production.length < 1) {
      pushError(errors, 'hosts.production must contain at least one hostname.');
    }
  }

  if (profile.commands !== undefined) {
    for (const field of ['install', 'check', 'build']) {
      if (!String(profile.commands?.[field] || '').trim()) {
        pushError(errors, `commands.${field} must be a non-empty string.`);
      }
    }
    for (const envName of ['development', 'production']) {
      const deployCommand = profile.commands?.deploy?.[envName];
      if (!deployCommand) continue;
      const result = validateDeployCommand(deployCommand, `commands.deploy.${envName}`);
      if (!result.ok) pushError(errors, result.error);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertValidSiteProfile(profile = {}) {
  const result = validateSiteProfile(profile);
  if (!result.ok) {
    throw new Error(`Invalid site profile:\n- ${result.errors.join('\n- ')}`);
  }
  return profile;
}

export function assertSafeProjectRoot(projectRoot, options = {}) {
  const resolved = path.resolve(String(projectRoot || '').trim());
  if (!resolved) throw new Error('Project root resolved to an empty path.');

  const blockedRoots = process.platform === 'win32'
    ? [path.parse(resolved).root.toLowerCase()]
    : ['/'];
  if (blockedRoots.includes(resolved.toLowerCase())) {
    throw new Error(`Refusing to operate on filesystem root: ${resolved}`);
  }

  if (!fs.existsSync(resolved)) {
    if (options.allowMissing) return resolved;
    throw new Error(`Project root does not exist: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Project root is not a directory: ${resolved}`);
  }

  const markers = [
    'package.json',
    'wrangler.toml',
    'wrangler.jsonc',
    'astro.config.mjs',
    'astro.config.ts',
    'astro.config.js'
  ];
  const hasMarker = markers.some((name) => fs.existsSync(path.join(resolved, name)));
  if (!hasMarker && options.requireProjectMarker !== false) {
    throw new Error(
      `Project root ${resolved} is missing a project marker (package.json, wrangler.toml, or astro.config.*).`
    );
  }

  return resolved;
}
