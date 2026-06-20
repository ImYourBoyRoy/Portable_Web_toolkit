// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/robots-management.mjs
/**
 * Audit and optionally fix Cloudflare-managed robots.txt/content-signal posture.
 *
 * Reads profile-driven bot-management preferences, inspects the live
 * `robots.txt`, and can safely apply the matching Cloudflare bot-management
 * API change without altering unrelated bot protections.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential, summarizeAuthSource } from '../lib/auth.mjs';
import { resolveZoneByName } from '../lib/cloudflare-api.mjs';
import {
  botManagementPreference,
  desiredBotManagementPatch,
  fetchBotManagement,
  inspectLiveRobots,
  updateBotManagement
} from '../lib/bot-management.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { prettyJson, toBool, utcStamp } from '../lib/format.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';

function primaryProductionHost(site) {
  return site.productionHosts[0] || site.zoneName;
}

function robotsOutputPath(outputDir, zoneName) {
  return path.join(outputDir, `robots-audit-${zoneName.replaceAll('.', '_')}-${utcStamp()}.json`);
}

export async function runRobotsAudit(flags = {}) {
  const site = loadSiteProfile(flags);
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const auth = resolveCloudflareCredential(env, { allowWranglerOauth: false, requireApiToken: true });
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));
  const zone = await resolveZoneByName(auth.token, site.zoneName);
  const preference = botManagementPreference(site.profile);
  const liveRobots = await inspectLiveRobots(primaryProductionHost(site));
  const botConfig = await fetchBotManagement(auth.token, zone.id);

  const botResult = botConfig.ok ? botConfig.payload?.result || {} : null;
  const desired = botConfig.ok ? desiredBotManagementPatch(site.profile, botResult) : null;
  const report = {
    checkedAt: new Date().toISOString(),
    profile: site.profile.siteId,
    auth: { source: auth.source, label: summarizeAuthSource(auth) },
    zone: { id: zone.id, name: zone.name },
    preference,
    botManagement: botConfig.ok
      ? {
          ok: true,
          current: botResult,
          drift: desired?.drift || [],
          patch: desired?.patch || null
        }
      : {
          ok: false,
          error: botConfig.error
        },
    liveRobots: {
      url: liveRobots.url,
      ok: liveRobots.ok,
      status: liveRobots.status,
      hasContentSignal: liveRobots.hasContentSignal,
      hasManagedBlock: liveRobots.hasManagedBlock,
      preview: liveRobots.preview,
      ...(liveRobots.error ? { error: liveRobots.error } : {})
    }
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = robotsOutputPath(outputDir, zone.name);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');

  const hasDesiredDrift = Boolean(desired?.drift?.length);
  const hasLiveIssue = preference.enabled
    ? (preference.contentSignalsPolicy === false && liveRobots.hasContentSignal)
      || (preference.managedRobotsTxt === false && liveRobots.hasManagedBlock)
    : false;

  console.log('\nCloudflare robots audit');
  console.log(`- Profile: ${site.profile.siteId}`);
  console.log(`- Auth: ${summarizeAuthSource(auth)}`);
  console.log(`- Zone: ${zone.name} (${zone.id})`);
  console.log(`- Preference enabled: ${preference.enabled ? 'yes' : 'no'}`);
  console.log(`- Live content-signal present: ${liveRobots.hasContentSignal ? 'yes' : 'no'}`);
  console.log(`- Live managed robots block present: ${liveRobots.hasManagedBlock ? 'yes' : 'no'}`);
  if (!botConfig.ok) {
    console.log(`- Bot Management API: unavailable (${botConfig.error})`);
  } else {
    console.log(`- Config drift items: ${desired?.drift?.length || 0}`);
  }
  console.log(`- Report: ${outputPath}`);

  return !botConfig.ok || hasDesiredDrift || hasLiveIssue ? 2 : 0;
}

export async function runRobotsFix(flags = {}) {
  const site = loadSiteProfile(flags);
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const auth = resolveCloudflareCredential(env, { allowWranglerOauth: false, requireApiToken: true });
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));
  const apply = toBool(flags.apply, false);
  const zone = await resolveZoneByName(auth.token, site.zoneName);
  const botConfig = await fetchBotManagement(auth.token, zone.id);
  if (!botConfig.ok) {
    throw new Error(`Bot Management API unavailable: ${botConfig.error}`);
  }

  const current = botConfig.payload?.result || {};
  const desired = desiredBotManagementPatch(site.profile, current);
  if (!desired.preference.enabled) {
    throw new Error('No botManagement preference configured in the site profile. Set cloudflare.botManagement first.');
  }

  const report = {
    checkedAt: new Date().toISOString(),
    profile: site.profile.siteId,
    auth: { source: auth.source, label: summarizeAuthSource(auth) },
    zone: { id: zone.id, name: zone.name },
    dryRun: !apply,
    preference: desired.preference,
    current,
    drift: desired.drift,
    patch: desired.patch,
    result: null
  };

  if (desired.patch && apply) {
    const updated = await updateBotManagement(auth.token, zone.id, current, desired.patch);
    report.result = updated?.result || null;
  }

  const liveRobots = await inspectLiveRobots(primaryProductionHost(site));
  report.liveRobots = {
    url: liveRobots.url,
    ok: liveRobots.ok,
    status: liveRobots.status,
    hasContentSignal: liveRobots.hasContentSignal,
    hasManagedBlock: liveRobots.hasManagedBlock,
    preview: liveRobots.preview
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `robots-fix-${zone.name.replaceAll('.', '_')}-${utcStamp()}.json`);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');

  console.log('\nCloudflare robots fix');
  console.log(`- Profile: ${site.profile.siteId}`);
  console.log(`- Zone: ${zone.name} (${zone.id})`);
  console.log(`- Mode: ${apply ? 'apply' : 'dry-run'}`);
  console.log(`- Drift items: ${desired.drift.length}`);
  console.log(`- Report: ${outputPath}`);

  return desired.drift.length > 0 && !apply ? 2 : 0;
}

