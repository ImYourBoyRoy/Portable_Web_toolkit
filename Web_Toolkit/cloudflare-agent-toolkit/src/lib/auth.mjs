// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/auth.mjs
/**
 * Cloudflare credential resolution helpers.
 *
 * Prefers an explicit CLOUDFLARE_API_TOKEN and can fall back to Wrangler's
 * local OAuth session for read-only audit commands when no API token is set.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function normalizeValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === '<empty>') return '';
  return trimmed;
}

function parseTomlString(raw, key) {
  const match = raw.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'));
  return match ? match[1] : '';
}

function parseTomlStringArray(raw, key) {
  const match = raw.match(new RegExp(`^${key}\\s*=\\s*\\[(.*?)\\]`, 'ms'));
  if (!match) return [];
  return match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^"/, '').replace(/"$/, ''));
}

function candidateWranglerConfigPaths() {
  const home = os.homedir();
  const appData = process.env.APPDATA || '';
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const configRoots = [
    path.join(home, '.wrangler'),
    path.join(xdgConfigHome, '.wrangler'),
    appData ? path.join(appData, '.wrangler') : null,
    appData ? path.join(appData, 'xdg.config', '.wrangler') : null
  ].filter(Boolean);

  return configRoots.map((root) => path.join(root, 'config', 'default.toml'));
}

export function loadWranglerOauthConfig() {
  for (const configPath of candidateWranglerConfigPaths()) {
    if (!fs.existsSync(configPath)) continue;
    const raw = fs.readFileSync(configPath, 'utf8');
    const oauthToken = normalizeValue(parseTomlString(raw, 'oauth_token'));
    if (!oauthToken) continue;
    return {
      ok: true,
      configPath,
      oauthToken,
      expirationTime: normalizeValue(parseTomlString(raw, 'expiration_time')),
      refreshTokenPresent: Boolean(normalizeValue(parseTomlString(raw, 'refresh_token'))),
      scopes: parseTomlStringArray(raw, 'scopes')
    };
  }

  return { ok: false };
}

export function resolveCloudflareCredential(env, options = {}) {
  const {
    allowWranglerOauth = false,
    requireApiToken = false
  } = options;

  const apiToken = normalizeValue(env?.CLOUDFLARE_API_TOKEN);
  if (apiToken) {
    return {
      token: apiToken,
      source: 'api-token',
      authType: 'api-token'
    };
  }

  const wranglerOauth = loadWranglerOauthConfig();
  if (wranglerOauth.ok && allowWranglerOauth && !requireApiToken) {
    return {
      token: wranglerOauth.oauthToken,
      source: 'wrangler-oauth',
      authType: 'wrangler-oauth',
      configPath: wranglerOauth.configPath,
      expirationTime: wranglerOauth.expirationTime,
      scopes: wranglerOauth.scopes
    };
  }

  if (wranglerOauth.ok && requireApiToken) {
    throw new Error(
      'Missing CLOUDFLARE_API_TOKEN. Wrangler OAuth is available for read-only audits, but this command requires a real API token.'
    );
  }

  throw new Error('Missing CLOUDFLARE_API_TOKEN. Set it in .env or your shell environment.');
}

export function summarizeAuthSource(credential) {
  if (!credential) return 'none';
  if (credential.source === 'api-token') return 'API token';
  if (credential.source === 'wrangler-oauth') return 'Wrangler OAuth';
  return credential.source;
}

