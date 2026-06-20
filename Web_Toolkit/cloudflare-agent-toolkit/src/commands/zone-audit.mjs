// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/zone-audit.mjs
/**
 * Cloudflare zone telemetry and security configuration audit command.
 *
 * Captures key zone settings, route and DNS snapshots, and 24h traffic
 * analytics to reduce infrastructure guesswork during reviews.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SETTINGS_TO_CHECK } from '../config/defaults.mjs';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential, summarizeAuthSource } from '../lib/auth.mjs';
import {
  fetch24hHttpAnalytics,
  resolveZoneByName,
  safeCloudflareRequest
} from '../lib/cloudflare-api.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { prettyJson, utcStamp } from '../lib/format.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';

function parseHosts(value, fallback = []) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

function summarizeSettings(results) {
  const summary = {};
  for (const result of results) {
    const key = result.endpoint.split('/').pop() || 'unknown';
    if (!result.ok) {
      summary[key] = { ok: false, error: result.error };
      continue;
    }
    summary[key] = {
      ok: true,
      value: result.payload?.result?.value ?? null,
      editable: result.payload?.result?.editable ?? null
    };
  }
  return summary;
}

function interestingDns(records, zoneName, hostFilter) {
  return records
    .filter((entry) => {
      const name = String(entry?.name || '').toLowerCase();
      if (name === zoneName.toLowerCase()) return true;
      if (hostFilter.length === 0) return true;
      return hostFilter.includes(name);
    })
    .map((entry) => ({
      id: entry.id,
      type: entry.type,
      name: entry.name,
      content: entry.content,
      proxied: entry.proxied,
      ttl: entry.ttl
    }));
}

export async function runZoneAudit(flags = {}) {
  const site = flags.profile || flags['site-profile'] ? loadSiteProfile(flags) : null;
  const env = site ? mergedEnv([path.join(site.projectRoot, '.env')]) : mergedEnv();
  const auth = resolveCloudflareCredential(env, { allowWranglerOauth: true });
  const token = auth.token;
  const zoneName = String(flags.zone || site?.zoneName || envValue(env, 'CF_ZONE_NAME', '')).trim();
  if (!zoneName) throw new Error('Missing zone name. Set CF_ZONE_NAME or pass --zone.');

  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));
  const hostsFilter = parseHosts(
    flags.hosts || envValue(env, 'CF_HOSTS_OF_INTEREST', ''),
    [zoneName.toLowerCase(), `www.${zoneName.toLowerCase()}`, `dev.${zoneName.toLowerCase()}`]
  );

  const zone = await resolveZoneByName(token, zoneName);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const until = new Date().toISOString();

  const settingResults = await Promise.all(
    SETTINGS_TO_CHECK.map((setting) =>
      safeCloudflareRequest(token, `/zones/${zone.id}/settings/${setting}`)
    )
  );

  const [routes, dns, wafRules, analytics] = await Promise.all([
    safeCloudflareRequest(token, `/zones/${zone.id}/workers/routes`),
    safeCloudflareRequest(token, `/zones/${zone.id}/dns_records?per_page=200`),
    safeCloudflareRequest(token, `/zones/${zone.id}/rulesets?per_page=50`),
    (async () => {
      try {
        const payload = await fetch24hHttpAnalytics(token, zone.id, since, until);
        return { ok: true, payload };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    })()
  ]);

  const dnsRecords = Array.isArray(dns?.payload?.result) ? dns.payload.result : [];
  const routeRows = Array.isArray(routes?.payload?.result) ? routes.payload.result : [];
  const rulesets = Array.isArray(wafRules?.payload?.result) ? wafRules.payload.result : [];

  const settingsSummary = summarizeSettings(settingResults);

  // Advisory: Cloudflare deprecated Auto Minify in Aug 2024
  const minifyAdvisory = settingsSummary.minify
    ? {
      deprecated: true,
      message: 'Cloudflare Auto Minify was deprecated Aug 2024. Prefer build-time minification (Vite, esbuild, Terser, CSSNano).',
      currentValue: settingsSummary.minify.value
    }
    : null;

  const report = {
    checkedAt: new Date().toISOString(),
    auth: {
      source: auth.source,
      label: summarizeAuthSource(auth)
    },
    zone: {
      id: zone.id,
      name: zone.name,
      status: zone.status,
      paused: zone.paused,
      plan: zone.plan?.name || null
    },
    settings: settingsSummary,
    ...(minifyAdvisory ? { minifyAdvisory } : {}),
    workers: routes.ok
      ? {
        routeCount: routeRows.length,
        routes: routeRows.map((entry) => ({
          id: entry.id,
          pattern: entry.pattern,
          script: entry.script,
          enabled: entry.enabled
        }))
      }
      : { error: routes.error },
    dns: dns.ok
      ? {
        totalCount: dnsRecords.length,
        hostFilter: hostsFilter,
        interestingRecords: interestingDns(dnsRecords, zoneName, hostsFilter)
      }
      : { error: dns.error },
    waf: wafRules.ok
      ? {
        totalRulesets: rulesets.length,
        firewallRulesets: rulesets.filter((entry) => String(entry?.phase || '').includes('firewall')).length
      }
      : { error: wafRules.error },
    analytics24h: analytics.ok
      ? {
        since,
        until,
        bucketCount: analytics.payload.bucketCount,
        requestsAll: analytics.payload.requestsAll,
        requestsCached: analytics.payload.requestsCached,
        threatsAll: analytics.payload.threatsAll,
        uniquesHourSum: analytics.payload.uniquesHourSum
      }
      : { since, until, error: analytics.error }
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `zone-audit-${zone.name.replaceAll('.', '_')}-${utcStamp()}.json`);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');

  console.log('\nCloudflare zone audit');
  console.log(`- Auth: ${summarizeAuthSource(auth)}`);
  console.log(`- Zone: ${zone.name} (${zone.id})`);
  console.log(`- Worker routes: ${report.workers.routeCount ?? 'n/a'}`);
  console.log(`- Interesting DNS records: ${report.dns.interestingRecords?.length ?? 'n/a'}`);
  if (report.analytics24h.error) {
    console.log(`- 24h analytics: unavailable (${report.analytics24h.error})`);
  } else {
    console.log(`- 24h requests: ${report.analytics24h.requestsAll}`);
    console.log(`- 24h threats: ${report.analytics24h.threatsAll}`);
  }
  console.log(`- Report: ${outputPath}`);

  const failedSettings = Object.values(report.settings).filter((entry) => entry.ok === false).length;
  const hasErrors = Boolean(report.workers.error || report.dns.error || report.waf.error || report.analytics24h.error || failedSettings > 0);
  return hasErrors ? 2 : 0;
}

