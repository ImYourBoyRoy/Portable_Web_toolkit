// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/wrangler.mjs
/**
 * Wrangler command orchestration for cf-agent.
 *
 * Supports install/update flows, auth commands, version checks, and
 * temporary-session enforcement with optional hard credential wipes.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCommand } from './exec.mjs';
import { clearSessionMeta, readSessionMeta } from './env.mjs';

function commandExists(command) {
  try {
    runCommand(command, ['--version'], { throwOnError: true });
    return true;
  } catch {
    return false;
  }
}

export function hasNpx() {
  return commandExists('npx');
}

export function wranglerVersion() {
  const result = runCommand('npx', ['wrangler', '--version'], { throwOnError: false });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function runWrangler(args, options = {}) {
  return runCommand('npx', ['wrangler', ...args], {
    throwOnError: options.throwOnError !== false,
    env: options.env
  });
}

export function installOrUpdateWrangler({ global = false } = {}) {
  if (global) {
    return runCommand('npm', ['install', '-g', 'wrangler@latest']);
  }
  return runCommand('npm', ['install', '--save-dev', 'wrangler@latest']);
}

export function wranglerWhoami() {
  return runWrangler(['whoami'], { throwOnError: false });
}

export function wranglerLogin() {
  return runWrangler(['login'], { throwOnError: true });
}

export function wranglerLogout() {
  return runWrangler(['logout'], { throwOnError: false });
}

export function enforceTemporarySession() {
  const meta = readSessionMeta();
  if (!meta || meta.profile !== 'temporary') {
    return { enforced: false, expired: false, meta };
  }

  const expiresAtMs = Number(meta.expiresAtMs || 0);
  if (!expiresAtMs || Date.now() <= expiresAtMs) {
    return { enforced: true, expired: false, meta };
  }

  wranglerLogout();
  clearSessionMeta();
  throw new Error('Temporary wrangler session expired and was logged out. Run: cf-agent auth login --profile temporary --ttl 24h');
}

function candidateCredentialDirs() {
  const home = os.homedir();
  const appData = process.env.APPDATA || '';
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return [
    path.join(home, '.wrangler'),
    path.join(xdgConfigHome, '.wrangler'),
    appData ? path.join(appData, '.wrangler') : null,
    appData ? path.join(appData, 'xdg.config', '.wrangler') : null
  ].filter(Boolean);
}

export function wipeLocalWranglerCredentials() {
  const removed = [];
  for (const target of candidateCredentialDirs()) {
    if (!fs.existsSync(target)) continue;
    try {
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(target);
    } catch {
      // Best effort.
    }
  }
  clearSessionMeta();
  return removed;
}


