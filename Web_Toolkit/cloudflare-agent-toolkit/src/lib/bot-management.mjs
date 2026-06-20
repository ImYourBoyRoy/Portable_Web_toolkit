// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/bot-management.mjs
/**
 * Cloudflare Bot Management helpers for managed robots.txt and content-signal posture.
 *
 * Provides profile-driven preference parsing, live robots.txt inspection, and
 * safe Cloudflare API read/update helpers that preserve unrelated bot settings.
 */

import { cloudflareRequest, safeCloudflareRequest } from './cloudflare-api.mjs';

const WRITABLE_KEYS = [
  'ai_bots_protection',
  'cf_robots_variant',
  'crawler_protection',
  'enable_js',
  'fight_mode',
  'is_robots_txt_managed',
  'optimize_wordpress',
  'sbfm_definitely_automated',
  'sbfm_likely_automated',
  'sbfm_static_resource_protection',
  'sbfm_verified_bots',
  'suppress_session_score'
];

export function botManagementPreference(profile = {}) {
  const configured = profile?.cloudflare?.botManagement || {};
  const hasManaged = typeof configured.managedRobotsTxt === 'boolean';
  const hasPolicy = typeof configured.contentSignalsPolicy === 'boolean';
  return {
    configured,
    enabled: hasManaged || hasPolicy,
    managedRobotsTxt: hasManaged ? configured.managedRobotsTxt : null,
    contentSignalsPolicy: hasPolicy ? configured.contentSignalsPolicy : null
  };
}

export async function fetchBotManagement(token, zoneId) {
  return safeCloudflareRequest(token, `/zones/${zoneId}/bot_management`);
}

function pickWritableFields(currentConfig = {}) {
  const body = {};
  for (const key of WRITABLE_KEYS) {
    if (currentConfig[key] !== undefined) {
      body[key] = currentConfig[key];
    }
  }
  return body;
}

export function desiredBotManagementPatch(profile = {}, currentConfig = {}) {
  const preference = botManagementPreference(profile);
  if (!preference.enabled) {
    return { preference, patch: null, drift: [] };
  }

  const desired = {};
  const drift = [];

  if (preference.managedRobotsTxt !== null && currentConfig.is_robots_txt_managed !== preference.managedRobotsTxt) {
    desired.is_robots_txt_managed = preference.managedRobotsTxt;
    drift.push({
      field: 'is_robots_txt_managed',
      before: currentConfig.is_robots_txt_managed ?? null,
      after: preference.managedRobotsTxt
    });
  }

  if (preference.contentSignalsPolicy !== null) {
    const desiredVariant = preference.contentSignalsPolicy ? 'policy_only' : 'off';
    if (currentConfig.cf_robots_variant !== desiredVariant) {
      desired.cf_robots_variant = desiredVariant;
      drift.push({
        field: 'cf_robots_variant',
        before: currentConfig.cf_robots_variant ?? null,
        after: desiredVariant
      });
    }
  }

  return { preference, patch: Object.keys(desired).length > 0 ? desired : null, drift };
}

export async function updateBotManagement(token, zoneId, currentConfig = {}, patch = {}) {
  const body = { ...pickWritableFields(currentConfig), ...patch };
  return cloudflareRequest(token, `/zones/${zoneId}/bot_management`, {
    method: 'PUT',
    body
  });
}

export async function inspectLiveRobots(hostname) {
  const url = hostname.startsWith('http') ? hostname : `https://${hostname}`;
  const robotsUrl = `${url.replace(/\/$/, '')}/robots.txt`;
  try {
    const response = await fetch(robotsUrl, { redirect: 'follow' });
    const text = await response.text();
    return {
      ok: response.ok,
      url: robotsUrl,
      status: response.status,
      hasContentSignal: /content-signal\s*:/i.test(text),
      hasManagedBlock: /cloudflare managed content/i.test(text),
      preview: text.split(/\r?\n/).slice(0, 24),
      content: text
    };
  } catch (error) {
    return {
      ok: false,
      url: robotsUrl,
      status: null,
      error: error instanceof Error ? error.message : String(error),
      hasContentSignal: false,
      hasManagedBlock: false,
      preview: [],
      content: ''
    };
  }
}


