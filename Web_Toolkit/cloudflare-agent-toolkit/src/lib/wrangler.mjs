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
import { binaryCommand, commandsFor, detectPackageManager } from '../../../shared/lib/package-manager.mjs';
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

/** Wrangler runs through the current project's package manager (npx for npm sites, pnpm exec for pnpm sites). */
function wranglerCommand(args) {
  return binaryCommand(detectPackageManager(process.cwd()).name, 'wrangler', args);
}

export function wranglerVersion() {
  const [command, commandArgs] = wranglerCommand(['--version']);
  const result = runCommand(command, commandArgs, { throwOnError: false });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function runWrangler(args, options = {}) {
  const [command, commandArgs] = wranglerCommand(args);
  return runCommand(command, commandArgs, {
    throwOnError: options.throwOnError !== false,
    env: options.env
  });
}

export function installOrUpdateWrangler({ global = false } = {}) {
  if (global) {
    return runCommand('npm', ['install', '-g', 'wrangler@latest']);
  }
  const pm = detectPackageManager(process.cwd()).name;
  const add = commandsFor(pm).add(['wrangler@latest'], { dev: true });
  return runCommand(commandsFor(pm).bin, add);
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


