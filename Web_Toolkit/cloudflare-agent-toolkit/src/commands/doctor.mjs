// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/doctor.mjs
/**
 * Environment diagnostics command for cf-agent.
 *
 * Checks Node/npm/npx/wrangler availability, wrangler auth status, and
 * optional Cloudflare API token + zone reachability.
 */

import process from 'node:process';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential, summarizeAuthSource } from '../lib/auth.mjs';
import { hasNpx, wranglerVersion, wranglerWhoami } from '../lib/wrangler.mjs';
import { resolveZoneByName, verifyToken } from '../lib/cloudflare-api.mjs';
import { toBool, prettyJson } from '../lib/format.mjs';

export async function runDoctor(flags = {}) {
  const env = mergedEnv();
  const offline = toBool(flags.offline, false);
  const jsonOut = toBool(flags.json, false);
  const zoneName = String(flags.zone || envValue(env, 'CF_ZONE_NAME', '')).trim();
  const apiToken = envValue(env, 'CLOUDFLARE_API_TOKEN', '');
  let credential = null;
  if (!offline) {
    try {
      credential = resolveCloudflareCredential(env, { allowWranglerOauth: true });
    } catch {
      credential = null;
    }
  }

  const report = {
    checkedAt: new Date().toISOString(),
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      npxAvailable: hasNpx(),
      wranglerVersion: wranglerVersion()
    },
    wranglerAuth: null,
    token: null,
    zone: null
  };

  if (!offline && report.runtime.npxAvailable) {
    const whoami = wranglerWhoami();
    report.wranglerAuth = {
      ok: whoami.status === 0,
      status: whoami.status,
      summary: (whoami.stdout || whoami.stderr || '').trim()
    };
  } else {
    report.wranglerAuth = { ok: false, skipped: true };
  }

  if (!offline && apiToken) {
    try {
      const tokenVerify = await verifyToken(apiToken);
      report.token = {
        ok: true,
        source: 'api-token',
        label: summarizeAuthSource({ source: 'api-token' }),
        tokenId: tokenVerify?.result?.id || null,
        status: tokenVerify?.result?.status || null
      };
    } catch (error) {
      report.token = {
        ok: false,
        source: 'api-token',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  } else if (credential?.source === 'wrangler-oauth') {
    report.token = {
      ok: true,
      source: credential.source,
      label: summarizeAuthSource(credential),
      note: 'Using Wrangler OAuth fallback for read-only zone audits; token-specific verification is not available.',
      expiresAt: credential.expirationTime || null
    };
  } else {
    report.token = { ok: false, skipped: true };
  }

  if (!offline && credential && zoneName) {
    try {
      const zone = await resolveZoneByName(credential.token, zoneName);
      report.zone = {
        ok: true,
        source: credential.source,
        id: zone.id,
        name: zone.name,
        status: zone.status,
        paused: zone.paused
      };
    } catch (error) {
      report.zone = {
        ok: false,
        source: credential.source,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  } else {
    report.zone = zoneName ? { ok: false, skipped: true } : { ok: false, skipped: true, reason: 'CF_ZONE_NAME not set' };
  }

  if (jsonOut) {
    process.stdout.write(prettyJson(report));
  } else {
    console.log('\ncf-agent doctor');
    console.log(`- Node: ${report.runtime.nodeVersion}`);
    console.log(`- npx available: ${report.runtime.npxAvailable ? 'yes' : 'no'}`);
    console.log(`- Wrangler version: ${report.runtime.wranglerVersion || 'not found'}`);
    if (report.wranglerAuth?.skipped) {
      console.log('- Wrangler auth: skipped');
    } else {
      console.log(`- Wrangler auth: ${report.wranglerAuth?.ok ? 'ok' : 'not authenticated'}`);
    }
    if (report.token?.skipped) {
      console.log('- API token: skipped (set CLOUDFLARE_API_TOKEN to enable)');
    } else {
      console.log(`- Cloudflare auth: ${report.token?.ok ? `${report.token.label || report.token.source} ok` : 'failed'}`);
    }
    if (report.zone?.skipped) {
      console.log('- Zone lookup: skipped');
    } else if (report.zone?.ok) {
      console.log(`- Zone: ${report.zone.name} (${report.zone.id})`);
    } else {
      console.log(`- Zone lookup: failed (${report.zone?.error || 'unknown'})`);
    }
  }

  const hasHardFailure = !report.runtime.npxAvailable || !report.runtime.wranglerVersion;
  return hasHardFailure ? 2 : 0;
}

