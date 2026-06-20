// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/site-audit.mjs
/**
 * Combined site audit for profile-driven Cloudflare projects.
 *
 * Captures zone settings, DNS state, route verification, cache strategy, and
 * host security headers in one report.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SETTINGS_TO_CHECK } from '../config/defaults.mjs';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential, summarizeAuthSource } from '../lib/auth.mjs';
import { fetch24hHttpAnalytics, resolveZoneByName, safeCloudflareRequest } from '../lib/cloudflare-api.mjs';
import { prettyJson, utcStamp } from '../lib/format.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';
import { summarizeRulesets } from '../lib/audit/rules-summary.mjs';
import { auditEmailDns } from '../lib/audit/email-dns.mjs';
import { botManagementPreference, desiredBotManagementPatch, fetchBotManagement, inspectLiveRobots } from '../lib/bot-management.mjs';

async function headSummary(hostname) {
  const url = hostname.startsWith('http') ? hostname : `https://${hostname}`;
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    return {
      url,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      hsts: response.headers.get('strict-transport-security'),
      xRobotsTag: response.headers.get('x-robots-tag'),
      cacheControl: response.headers.get('cache-control')
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function summarizeSettings(results) {
  const summary = {};
  for (const result of results) {
    const key = result.endpoint.split('/').pop() || 'unknown';
    summary[key] = result.ok
      ? { ok: true, value: result.payload?.result?.value ?? null }
      : { ok: false, error: result.error };
  }
  return summary;
}

export async function runSiteAudit(flags = {}) {
  const site = loadSiteProfile(flags);
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const auth = resolveCloudflareCredential(env, { allowWranglerOauth: true });
  const token = auth.token;
  if (!site.zoneName) throw new Error('Missing zone name in site profile or --zone flag.');
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));

  const zone = await resolveZoneByName(token, site.zoneName);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const until = new Date().toISOString();

  const [dnsResult, routesResult, settingsResults, rulesetsResult, pageRulesResult, analytics, prodHosts, devHosts] = await Promise.all([
    safeCloudflareRequest(token, `/zones/${zone.id}/dns_records?per_page=200`),
    safeCloudflareRequest(token, `/zones/${zone.id}/workers/routes`),
    Promise.all(SETTINGS_TO_CHECK.map((setting) => safeCloudflareRequest(token, `/zones/${zone.id}/settings/${setting}`))),
    safeCloudflareRequest(token, `/zones/${zone.id}/rulesets?per_page=50`),
    safeCloudflareRequest(token, `/zones/${zone.id}/pagerules`),
    fetch24hHttpAnalytics(token, zone.id, since, until).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })),
    Promise.all(site.productionHosts.map((host) => headSummary(host))),
    Promise.all(site.developmentHosts.map((host) => headSummary(host)))
  ]);
  const [botManagementResult, liveRobots] = await Promise.all([
    fetchBotManagement(token, zone.id),
    inspectLiveRobots(site.productionHosts[0] || zone.name)
  ]);

  const records = Array.isArray(dnsResult?.payload?.result) ? dnsResult.payload.result : [];
  const routes = Array.isArray(routesResult?.payload?.result) ? routesResult.payload.result : [];
  const rulesets = Array.isArray(rulesetsResult?.payload?.result) ? rulesetsResult.payload.result : [];
  const pageRules = Array.isArray(pageRulesResult?.payload?.result) ? pageRulesResult.payload.result : [];
  const expectedRoutes = [
    ...(site.profile?.cloudflare?.routes?.production || []),
    ...(site.profile?.cloudflare?.routes?.development || [])
  ];
  const robotPreference = botManagementPreference(site.profile);
  const botCurrent = botManagementResult.ok ? botManagementResult.payload?.result || {} : null;
  const botDesired = botManagementResult.ok ? desiredBotManagementPatch(site.profile, botCurrent) : null;

  const report = {
    checkedAt: new Date().toISOString(),
    profile: site.profile.siteId,
    projectRoot: site.projectRoot,
    deployTarget: site.deployTarget,
    auth: {
      source: auth.source,
      label: summarizeAuthSource(auth)
    },
    zone: {
      id: zone.id,
      name: zone.name,
      status: zone.status,
      nameServers: zone.name_servers || [],
      originalNameServers: zone.original_name_servers || []
    },
    settings: summarizeSettings(settingsResults),
    cacheStrategy: {
      defaultMode: site.profile?.cloudflare?.cachePurge?.defaultMode || 'url',
      note: 'Cloudflare recommends single-file purge first. Prefer build-time minification over deprecated Auto Minify.'
    },
    crawlPolicy: {
      configured: site.profile?.cloudflare?.crawlPolicy || {},
      productionHeaders: prodHosts,
      developmentHeaders: devHosts,
      developmentBlocked: devHosts.every((entry) => String(entry.xRobotsTag || '').toLowerCase().includes('noindex'))
    },
    dns: dnsResult.ok
      ? records
        .filter((record) => [...site.productionHosts, ...site.developmentHosts].includes(String(record.name || '').toLowerCase()))
        .map((record) => ({
          id: record.id,
          type: record.type,
          name: record.name,
          content: record.content,
          proxied: record.proxied
        }))
      : { error: dnsResult.error },
    workers: {
      expectedRoutes,
      checks: expectedRoutes.map((pattern) => ({
        pattern,
        ok: routes.some((route) => route.pattern === pattern)
      })),
      ...(routesResult.ok ? {} : { error: routesResult.error }),
      liveRoutes: routes.map((route) => ({
        id: route.id,
        pattern: route.pattern,
        script: route.script,
        enabled: route.enabled
      }))
    },
    rules: rulesetsResult.ok && pageRulesResult.ok
      ? summarizeRulesets(rulesets, pageRules)
      : {
          error: [rulesetsResult.ok ? null : rulesetsResult.error, pageRulesResult.ok ? null : pageRulesResult.error].filter(Boolean).join('; ')
        },
    robots: {
      preference: robotPreference,
      cloudflare: botManagementResult.ok
        ? {
            ok: true,
            current: botCurrent,
            drift: botDesired?.drift || [],
            patch: botDesired?.patch || null
          }
        : {
            ok: false,
            error: botManagementResult.error
          },
      live: {
        url: liveRobots.url,
        ok: liveRobots.ok,
        status: liveRobots.status,
        hasContentSignal: liveRobots.hasContentSignal,
        hasManagedBlock: liveRobots.hasManagedBlock,
        preview: liveRobots.preview,
        ...(liveRobots.error ? { error: liveRobots.error } : {})
      }
    },
    emailDns: dnsResult.ok
      ? auditEmailDns(records, zone.name)
      : { error: dnsResult.error },
    analytics24h: analytics?.error ? { error: analytics.error, since, until } : { since, until, ...analytics },
    deployReadiness: {
      projectRootMatchesProfile: String(site.profile?.projectRoot || '').length > 0,
      hasDeployCommands: Boolean(site.profile?.commands?.deploy?.production || site.profile?.commands?.deploy?.development)
    }
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `site-audit-${zone.name.replaceAll('.', '_')}-${utcStamp()}.json`);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');

  const routeFailures = report.workers.checks.filter((entry) => !entry.ok).length;
  const devCrawlFailure = report.crawlPolicy.developmentBlocked ? 0 : 1;
  const dnsFailure = typeof report.dns === 'object' && !Array.isArray(report.dns) && report.dns?.error ? 1 : 0;
  const robotFailure = robotPreference.enabled
    ? (!botManagementResult.ok
      || Boolean(botDesired?.drift?.length)
      || (robotPreference.contentSignalsPolicy === false && liveRobots.hasContentSignal)
      || (robotPreference.managedRobotsTxt === false && liveRobots.hasManagedBlock))
    : false;
  console.log('\nCloudflare site audit');
  console.log(`- Profile: ${site.profile.siteId}`);
  console.log(`- Auth: ${summarizeAuthSource(auth)}`);
  console.log(`- Zone: ${zone.name} (${zone.id})`);
  console.log(`- Production hosts: ${site.productionHosts.join(', ')}`);
  console.log(`- Development hosts: ${site.developmentHosts.join(', ')}`);
  console.log(`- Missing worker routes: ${routeFailures}`);
  console.log(`- Dev crawl blocked: ${report.crawlPolicy.developmentBlocked ? 'yes' : 'no'}`);
  if (robotPreference.enabled) {
    console.log(`- Robots drift: ${robotFailure ? 'yes' : 'no'}`);
  }
  console.log(`- Report: ${outputPath}`);

  return routeFailures > 0 || devCrawlFailure > 0 || dnsFailure > 0 || routesResult.ok === false || robotFailure ? 2 : 0;
}

