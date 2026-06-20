// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/auth.mjs
/**
 * Authentication command suite for cf-agent.
 *
 * Supports wrangler login/logout/status plus temporary session lifetimes and
 * hard credential wipes for quick account handoff.
 */

import { mergedEnv, parseDurationMs, writeSessionMeta, readSessionMeta, clearSessionMeta } from '../lib/env.mjs';
import {
  hasNpx,
  wranglerLogin,
  wranglerLogout,
  wranglerWhoami,
  wipeLocalWranglerCredentials
} from '../lib/wrangler.mjs';
import { REQUIRED_PERMISSION_NAMES } from '../config/defaults.mjs';

function sessionProfile(flags, env) {
  const value = String(flags.profile || env.CF_SESSION_PROFILE || 'persistent').trim().toLowerCase();
  if (value === 'permanent') return 'persistent';
  return value === 'temporary' ? 'temporary' : 'persistent';
}

function ttlInput(flags, env) {
  return String(flags.ttl || env.CF_SESSION_TTL || '24h');
}

function printMeta(meta) {
  if (!meta) {
    console.log('- Session profile: none (not managed by cf-agent)');
    return;
  }
  console.log(`- Session profile: ${meta.profile}`);
  if (meta.profile === 'temporary' && meta.expiresAtIso) {
    console.log(`- Temporary expiry: ${meta.expiresAtIso}`);
  }
}

export async function runAuth(subcommand, flags = {}) {
  const env = mergedEnv();
  const cmd = String(subcommand || 'status').trim().toLowerCase();

  if (cmd === 'login') {
    if (!hasNpx()) {
      console.error('npx is required. Install Node.js/npm first.');
      return 1;
    }
    const profile = sessionProfile(flags, env);
    const ttlMs = parseDurationMs(ttlInput(flags, env), 24 * 60 * 60 * 1000);
    const issuedAtMs = Date.now();
    const expiresAtMs = profile === 'temporary' ? issuedAtMs + ttlMs : null;

    wranglerLogin();

    writeSessionMeta({
      profile,
      issuedAtMs,
      issuedAtIso: new Date(issuedAtMs).toISOString(),
      expiresAtMs,
      expiresAtIso: expiresAtMs ? new Date(expiresAtMs).toISOString() : null
    });

    console.log('\nWrangler login complete.');
    console.log(`- Session profile: ${profile}`);
    if (profile === 'temporary') {
      console.log(`- Expires at: ${new Date(expiresAtMs).toISOString()}`);
      console.log('- When expired, cf-agent auto-logs out on next command.');
    }
    return 0;
  }

  if (cmd === 'logout') {
    if (!hasNpx()) {
      console.error('npx is required. Install Node.js/npm first.');
      return 1;
    }
    wranglerLogout();
    clearSessionMeta();
    console.log('\nWrangler logout complete. Local cf-agent session metadata cleared.');
    return 0;
  }

  if (cmd === 'wipe') {
    if (!hasNpx()) {
      console.error('npx is required. Install Node.js/npm first.');
      return 1;
    }
    wranglerLogout();
    const removed = wipeLocalWranglerCredentials();
    console.log('\nWrangler credentials wipe complete.');
    if (removed.length === 0) {
      console.log('- No credential directories found.');
    } else {
      for (const entry of removed) {
        console.log(`- Removed: ${entry}`);
      }
    }
    return 0;
  }

  if (cmd === 'token-guide' || cmd === 'token-url') {
    const zone = String(flags.zone || env.CF_ZONE_NAME || env.CF_EXPECTED_ZONE || '').trim();
    console.log('\nCloudflare API token setup guide');
    console.log('- Dashboard: https://dash.cloudflare.com/profile/api-tokens');
    console.log('- Wrangler cannot reliably create scoped user API tokens for you; create one in dashboard.');
    console.log('- Recommended token permissions for this toolkit:');
    for (const name of REQUIRED_PERMISSION_NAMES) {
      console.log(`  • ${name}`);
    }
    if (zone) {
      console.log(`- Restrict resources to zone/account used by: ${zone}`);
    } else {
      console.log('- Restrict resources to your exact zone/account scope (do not use account-wide * unless required).');
    }
    console.log('- Save token into .env as CLOUDFLARE_API_TOKEN=...');
    return 0;
  }

  if (!hasNpx()) {
    console.error('npx is required. Install Node.js/npm first.');
    return 1;
  }

  const whoami = wranglerWhoami();
  console.log('\nWrangler auth status');
  console.log(`- Authenticated: ${whoami.status === 0 ? 'yes' : 'no'}`);
  if (whoami.status === 0) {
    const firstLine = String(whoami.stdout || '').split(/\r?\n/).find((line) => line.trim());
    if (firstLine) console.log(`- Details: ${firstLine.trim()}`);
  } else {
    const details = String(whoami.stderr || whoami.stdout || '').trim();
    if (details) console.log(`- Details: ${details}`);
  }
  printMeta(readSessionMeta());
  return whoami.status === 0 ? 0 : 2;
}

