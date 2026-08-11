// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/zone-harden.mjs
/**
 * Cloudflare zone hardening command.
 *
 * Applies a production-safe baseline across HTTPS/TLS/performance/security
 * settings, ensures managed WAF execution, and runs post-change smoke checks.
 */

import fs from 'node:fs';
import path from 'node:path';
import { HARDENING_SETTINGS } from '../config/defaults.mjs';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential } from '../lib/auth.mjs';
import { cloudflareRequest, resolveZoneByName } from '../lib/cloudflare-api.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { prettyJson, toBool, utcStamp } from '../lib/format.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';
import { botManagementPreference, desiredBotManagementPatch, fetchBotManagement, updateBotManagement } from '../lib/bot-management.mjs';

function isEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseHosts(hostsCsv, zoneName) {
  const trimmed = String(hostsCsv || '').trim();
  if (!trimmed) {
    return [
      `https://${zoneName}`,
      `https://www.${zoneName}`,
      `https://dev.${zoneName}`
    ];
  }
  return trimmed
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.startsWith('http://') || entry.startsWith('https://') ? entry : `https://${entry}`));
}

async function getSetting(token, zoneId, settingId) {
  const payload = await cloudflareRequest(token, `/zones/${zoneId}/settings/${settingId}`);
  return payload?.result?.value;
}

async function setSetting(token, zoneId, settingId, value) {
  const payload = await cloudflareRequest(token, `/zones/${zoneId}/settings/${settingId}`, {
    method: 'PATCH',
    body: { value }
  });
  return payload?.result?.value;
}

async function ensureManagedWafEntrypoint(token, zoneId) {
  const rulesetsPayload = await cloudflareRequest(token, `/zones/${zoneId}/rulesets?per_page=50`);
  const rulesets = Array.isArray(rulesetsPayload?.result) ? rulesetsPayload.result : [];
  const managed = rulesets.find((entry) => entry?.kind === 'managed' && entry?.phase === 'http_request_firewall_managed');
  if (!managed?.id) {
    return { ensured: false, changed: false, message: 'Managed ruleset not found.' };
  }

  let entrypoint = null;
  try {
    const payload = await cloudflareRequest(token, `/zones/${zoneId}/rulesets/phases/http_request_firewall_managed/entrypoint`);
    entrypoint = payload?.result || null;
  } catch {
    entrypoint = null;
  }

  const executeRule = {
    action: 'execute',
    expression: 'true',
    description: 'Execute Cloudflare managed ruleset',
    enabled: true,
    action_parameters: { id: managed.id }
  };

  if (!entrypoint) {
    const created = await cloudflareRequest(token, `/zones/${zoneId}/rulesets`, {
      method: 'POST',
      body: {
        name: 'default',
        description: 'cf-agent managed WAF entrypoint',
        kind: 'zone',
        phase: 'http_request_firewall_managed',
        rules: [executeRule]
      }
    });
    return { ensured: true, changed: true, id: created?.result?.id || null, message: 'Created managed WAF entrypoint.' };
  }

  const rules = Array.isArray(entrypoint.rules) ? entrypoint.rules : [];
  const alreadyExists = rules.some((rule) => rule?.action === 'execute' && rule?.action_parameters?.id === managed.id);
  if (alreadyExists) {
    return { ensured: true, changed: false, id: entrypoint.id || null, message: 'Managed WAF entrypoint already configured.' };
  }

  const updated = await cloudflareRequest(token, `/zones/${zoneId}/rulesets/${entrypoint.id}`, {
    method: 'PUT',
    body: {
      name: entrypoint.name || 'default',
      description: entrypoint.description || 'cf-agent managed WAF entrypoint',
      kind: entrypoint.kind || 'zone',
      phase: entrypoint.phase || 'http_request_firewall_managed',
      rules: [...rules, executeRule]
    }
  });

  return { ensured: true, changed: true, id: updated?.result?.id || entrypoint.id || null, message: 'Updated managed WAF entrypoint.' };
}

function parseRollbackHosts(flags, zoneName, allSmokeHosts) {
  const explicit = String(flags['rollback-hosts'] || '').trim();
  if (explicit) {
    return parseHosts(explicit, zoneName);
  }
  return allSmokeHosts.filter((url) => !/:\/\/(?:dev|staging|preview)\./i.test(url));
}

async function smokeTest(hosts) {
  const results = [];
  for (const url of hosts) {
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'manual' });
      results.push({
        url,
        ok: response.status >= 200 && response.status < 400,
        status: response.status,
        hsts: response.headers.get('strict-transport-security'),
        server: response.headers.get('server')
      });
    } catch (error) {
      results.push({ url, ok: false, status: null, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

function needsSslRollback(results) {
  return results.some((entry) => [525, 526, 530].includes(entry.status));
}

export async function runZoneHarden(flags = {}) {
  const site = flags.profile || flags['site-profile'] ? loadSiteProfile(flags) : null;
  const env = site ? mergedEnv([path.join(site.projectRoot, '.env')]) : mergedEnv();
  const token = resolveCloudflareCredential(env, { requireApiToken: true }).token;
  const zoneName = String(flags.zone || site?.zoneName || envValue(env, 'CF_ZONE_NAME', '')).trim();
  if (!zoneName) throw new Error('Missing zone name. Set CF_ZONE_NAME or pass --zone.');

  const dryRun = toBool(flags['dry-run'], toBool(flags.apply, false) ? false : true);
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));
  const smokeHosts = parseHosts(flags.hosts || envValue(env, 'CF_HOSTS_OF_INTEREST', ''), zoneName);
  const zone = await resolveZoneByName(token, zoneName);
  const botPreference = site ? botManagementPreference(site.profile) : { enabled: false };

  const changes = [];
  for (const setting of HARDENING_SETTINGS) {
    try {
      const before = await getSetting(token, zone.id, setting.id);
      if (isEqual(before, setting.value)) {
        changes.push({ id: setting.id, changed: false, before, after: before });
        continue;
      }
      if (dryRun) {
        changes.push({ id: setting.id, changed: true, dryRun: true, before, after: setting.value });
        continue;
      }
      const after = await setSetting(token, zone.id, setting.id, setting.value);
      changes.push({ id: setting.id, changed: true, before, after });
    } catch (error) {
      changes.push({ id: setting.id, changed: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const waf = dryRun
    ? { ensured: true, changed: false, dryRun: true, message: 'Skipped managed WAF mutation in dry-run mode.' }
    : await ensureManagedWafEntrypoint(token, zone.id);

  let botManagement = { enabled: false, changed: false, skipped: true, message: 'No bot-management preference configured.' };
  if (botPreference.enabled) {
    const botConfig = await fetchBotManagement(token, zone.id);
    if (!botConfig.ok) {
      botManagement = {
        enabled: true,
        changed: false,
        error: botConfig.error,
        message: 'Bot Management API unavailable.'
      };
    } else {
      const current = botConfig.payload?.result || {};
      const desired = desiredBotManagementPatch(site.profile, current);
      if (!desired.patch) {
        botManagement = {
          enabled: true,
          changed: false,
          message: 'Managed robots/content-signal posture already matches the profile.',
          drift: desired.drift,
          current
        };
      } else if (dryRun) {
        botManagement = {
          enabled: true,
          changed: true,
          dryRun: true,
          message: 'Would update Cloudflare managed robots/content-signal posture.',
          drift: desired.drift,
          patch: desired.patch,
          current
        };
      } else {
        const updated = await updateBotManagement(token, zone.id, current, desired.patch);
        botManagement = {
          enabled: true,
          changed: true,
          message: 'Updated Cloudflare managed robots/content-signal posture.',
          drift: desired.drift,
          patch: desired.patch,
          result: updated?.result || null
        };
      }
    }
  }

  let smokeResults = await smokeTest(smokeHosts);
  const rollbackHosts = parseRollbackHosts(flags, zoneName, smokeHosts);
  const rollbackSmokeResults = smokeResults.filter((entry) => rollbackHosts.includes(entry.url));
  let rollback = { rolledBack: false, reason: null };
  if (!dryRun && needsSslRollback(rollbackSmokeResults)) {
    await setSetting(token, zone.id, 'ssl', 'full');
    rollback = {
      rolledBack: true,
      reason: 'Detected strict SSL breakage (525/526/530) on production hosts during smoke test.'
    };
    smokeResults = await smokeTest(smokeHosts);
  }

  const report = {
    checkedAt: new Date().toISOString(),
    zone: { id: zone.id, name: zone.name, status: zone.status },
    dryRun,
    settings: changes,
    waf,
    botManagement,
    rollback,
    rollbackHosts,
    smoke: smokeResults
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `zone-hardening-${zone.name.replaceAll('.', '_')}-${utcStamp()}.json`);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');

  const changed = changes.filter((entry) => entry.changed).length;
  const settingErrors = changes.filter((entry) => entry.error).length;
  const smokeFailures = smokeResults.filter((entry) => !entry.ok).length;

  console.log('\nCloudflare zone hardening');
  console.log(`- Zone: ${zone.name} (${zone.id})`);
  console.log(`- Mode: ${dryRun ? 'dry-run' : 'apply'}`);
  console.log(`- Settings changed: ${changed}`);
  console.log(`- WAF: ${waf.message}`);
  if (botPreference.enabled) {
    console.log(`- Robots: ${botManagement.message}`);
  }
  console.log(`- SSL rollback: ${rollback.rolledBack ? `yes (${rollback.reason})` : 'no'}`);
  console.log(`- Smoke failures: ${smokeFailures}`);
  if (changes.some((entry) => entry.id === 'minify')) {
    console.log('  ⚠ Cloudflare Auto Minify is deprecated (Aug 2024). Prefer build-time minification.');
  }
  console.log(`- Report: ${outputPath}`);

  return settingErrors > 0 || smokeFailures > 0 || Boolean(botManagement.error) ? 2 : 0;
}

