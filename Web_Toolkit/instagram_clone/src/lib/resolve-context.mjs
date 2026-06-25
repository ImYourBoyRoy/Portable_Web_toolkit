// ./Web_Toolkit/instagram_clone/src/lib/resolve-context.mjs
/**
 * Resolve Instagram clone targets from CLI flags, project .env, and site profile.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from '../../../shared/lib/env.mjs';

export function parseInstagramHandle(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/instagram\.com/i.test(raw)) {
    try {
      const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      const segment = url.pathname.split('/').filter(Boolean)[0];
      return segment ? segment.replace(/^@/, '') : '';
    } catch {
      /* fall through */
    }
  }

  return raw.replace(/^@/, '').split('/')[0].split('?')[0];
}

export function discoverSiteProfilePath(projectRoot, explicitPath = '') {
  if (explicitPath) return path.resolve(projectRoot, explicitPath);

  let entries = [];
  try {
    entries = fs.readdirSync(projectRoot, { withFileTypes: true });
  } catch {
    return '';
  }

  const matches = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.site-profile.json'))
    .map((entry) => path.join(projectRoot, entry.name));

  return matches.length === 1 ? matches[0] : '';
}

function readProfile(siteProfilePath) {
  if (!siteProfilePath || !fs.existsSync(siteProfilePath)) return null;
  return JSON.parse(fs.readFileSync(siteProfilePath, 'utf8'));
}

export function resolveInstagramUsername({ usernameFlag = '', mergedEnv = {}, profile = null } = {}) {
  const fromFlag = parseInstagramHandle(usernameFlag);
  if (fromFlag) return fromFlag;

  const fromEnv = parseInstagramHandle(mergedEnv.INSTAGRAM_USERNAME);
  if (fromEnv) return fromEnv;

  const fromProfile = parseInstagramHandle(profile?.instagram?.username);
  if (fromProfile) return fromProfile;

  const social =
    profile?.branding?.social?.instagram ||
    profile?.social?.instagram ||
    profile?.metadata?.instagram;

  return parseInstagramHandle(social);
}

export function resolveCloneContext({
  projectRoot = process.cwd(),
  usernameFlag = '',
  siteProfileFlag = '',
  limitFlag = '',
  env = process.env,
} = {}) {
  const resolvedRoot = path.resolve(projectRoot);
  const projectEnv = loadEnvFile(path.join(resolvedRoot, '.env'));
  const mergedEnv = { ...projectEnv, ...env };
  const siteProfilePath = discoverSiteProfilePath(resolvedRoot, siteProfileFlag);
  const profile = readProfile(siteProfilePath);
  const username = resolveInstagramUsername({ usernameFlag, mergedEnv, profile });
  const parsedLimit = Number.parseInt(
    String(limitFlag || mergedEnv.INSTAGRAM_CLONE_LIMIT || profile?.instagram?.cloneLimit || '24'),
    10,
  );

  return {
    projectRoot: resolvedRoot,
    username,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 24,
    siteProfilePath,
    profile,
    env: mergedEnv,
  };
}

export function formatMissingUsernameHelp({ projectRoot, siteProfilePath } = {}) {
  const lines = [
    '[ERROR] Instagram username is required.',
    '',
    'Provide one of:',
    '  --username <handle>',
    '  INSTAGRAM_USERNAME=<handle> in the target project .env',
    '  instagram.username in the site profile (when unambiguous)',
    '',
    `Project root: ${projectRoot || process.cwd()}`,
  ];

  if (siteProfilePath) {
    lines.push(`Site profile: ${siteProfilePath}`);
  } else {
    lines.push('Tip: add a single *.site-profile.json in the project root or pass --site-profile.');
  }

  return lines.join('\n');
}
