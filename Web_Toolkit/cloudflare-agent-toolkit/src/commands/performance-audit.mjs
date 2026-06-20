// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/performance-audit.mjs
/**
 * AI-agent-first Cloudflare performance posture audit. It emits compact JSON,
 * writes a full machine report, and focuses on switches that affect website
 * speed or Lighthouse variance. Run via `node ./bin/cf-agent.mjs performance audit`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential, summarizeAuthSource } from '../lib/auth.mjs';
import { resolveZoneByName, safeCloudflareRequest } from '../lib/cloudflare-api.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { prettyJson, utcStamp } from '../lib/format.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';

const PERFORMANCE_SETTINGS = [
  'brotli',
  'early_hints',
  'http3',
  'rocket_loader',
  'polish',
  'mirage',
  'minify',
  'browser_cache_ttl',
  'cache_level',
  'development_mode',
  'automatic_https_rewrites',
  'opportunistic_encryption',
  'ipv6',
  'websockets',
  'email_obfuscation',
  'hotlink_protection'
];

function settingKey(result) {
  return result.endpoint.split('/').pop() || 'unknown';
}

function summarizeSettings(results = []) {
  const summary = {};
  for (const result of results) {
    const key = settingKey(result);
    summary[key] = result.ok
      ? {
          ok: true,
          value: result.payload?.result?.value ?? null,
          editable: result.payload?.result?.editable ?? null
        }
      : {
          ok: false,
          error: result.error
        };
  }
  return summary;
}

function valueOf(settings, key) {
  return settings?.[key]?.value;
}

function hasAllLegacyMinifyOn(value) {
  return Boolean(value && value.css === 'on' && value.html === 'on' && value.js === 'on');
}

function configRulesSummary(entrypointResult) {
  if (!entrypointResult.ok) {
    return {
      ok: false,
      error: entrypointResult.error,
      rules: [],
      effectiveAutoMinify: false,
      rocketLoaderForcedOff: false
    };
  }
  const rules = Array.isArray(entrypointResult.payload?.result?.rules)
    ? entrypointResult.payload.result.rules
    : [];
  const compactRules = rules.map((rule) => ({
    id: rule.id,
    ref: rule.ref,
    enabled: rule.enabled,
    expression: rule.expression,
    autominify: rule.action_parameters?.autominify || null,
    rocket_loader: rule.action_parameters?.rocket_loader ?? null
  }));
  const effectiveAutoMinify = compactRules.some((rule) => {
    const minify = rule.enabled ? rule.autominify : null;
    return Boolean(minify?.html && minify?.css && minify?.js);
  });
  const rocketLoaderForcedOff = compactRules.some((rule) => rule.enabled && rule.rocket_loader === false);
  return {
    ok: true,
    rules: compactRules,
    effectiveAutoMinify,
    rocketLoaderForcedOff
  };
}

function addIssue(issues, severity, code, summary, evidence = {}) {
  issues.push({ severity, code, summary, evidence });
}

function evaluatePosture({ settings, rules }) {
  const issues = [];
  const externalNoise = [];
  const legacyMinify = valueOf(settings, 'minify');
  const effectiveAutoMinify = rules.effectiveAutoMinify || hasAllLegacyMinifyOn(legacyMinify);

  if (valueOf(settings, 'development_mode') !== 'off') {
    addIssue(issues, 'fail', 'cloudflare-development-mode-enabled', 'Cloudflare Development Mode is enabled.', {
      value: valueOf(settings, 'development_mode')
    });
  }
  if (valueOf(settings, 'cache_level') === 'bypass') {
    addIssue(issues, 'fail', 'cloudflare-cache-level-bypass', 'Cloudflare cache level is bypass.', {
      value: valueOf(settings, 'cache_level')
    });
  }
  if (valueOf(settings, 'brotli') !== 'on') {
    addIssue(issues, 'warn', 'cloudflare-brotli-off', 'Brotli compression is not enabled.', {
      value: valueOf(settings, 'brotli')
    });
  }
  if (valueOf(settings, 'http3') !== 'on') {
    addIssue(issues, 'warn', 'cloudflare-http3-off', 'HTTP/3 is not enabled.', {
      value: valueOf(settings, 'http3')
    });
  }
  if (valueOf(settings, 'early_hints') !== 'on') {
    addIssue(issues, 'warn', 'cloudflare-early-hints-off', 'Early Hints is not enabled.', {
      value: valueOf(settings, 'early_hints')
    });
  }
  if (valueOf(settings, 'rocket_loader') === 'on' && !rules.rocketLoaderForcedOff) {
    addIssue(issues, 'warn', 'cloudflare-rocket-loader-on', 'Rocket Loader is enabled and can alter script timing/Lighthouse variance.', {
      value: valueOf(settings, 'rocket_loader')
    });
  }
  if (valueOf(settings, 'mirage') === 'on') {
    addIssue(issues, 'warn', 'cloudflare-mirage-on', 'Mirage is enabled and can alter image loading behavior.', {
      value: valueOf(settings, 'mirage')
    });
  }
  if (!effectiveAutoMinify) {
    addIssue(issues, 'warn', 'cloudflare-auto-minify-not-effective', 'Auto Minify is not effective via legacy setting or config rule.', {
      legacyMinify,
      configRuleAutoMinify: rules.effectiveAutoMinify
    });
  }
  if (Number(valueOf(settings, 'browser_cache_ttl') || 0) < 14400) {
    addIssue(issues, 'warn', 'cloudflare-browser-cache-ttl-low', 'Browser cache TTL is below 14400 seconds.', {
      value: valueOf(settings, 'browser_cache_ttl')
    });
  }

  if (!hasAllLegacyMinifyOn(legacyMinify) && rules.effectiveAutoMinify) {
    externalNoise.push({
      code: 'legacy-minify-endpoint-off-config-rule-on',
      summary: 'Legacy minify endpoint reports off, but http_config_settings config rule enables Auto Minify.',
      evidence: { legacyMinify, configRules: rules.rules.map((rule) => rule.ref || rule.id).filter(Boolean) }
    });
  }

  return {
    status: issues.some((issue) => issue.severity === 'fail')
      ? 'fail'
      : issues.length > 0
        ? 'warn'
        : 'pass',
    actionableIssues: issues,
    externalNoise
  };
}

function compactSwitches(settings, rules) {
  const legacyMinify = valueOf(settings, 'minify');
  return {
    brotli: valueOf(settings, 'brotli'),
    earlyHints: valueOf(settings, 'early_hints'),
    http3: valueOf(settings, 'http3'),
    rocketLoader: rules.rocketLoaderForcedOff ? 'off-by-config-rule' : valueOf(settings, 'rocket_loader'),
    polish: valueOf(settings, 'polish'),
    mirage: valueOf(settings, 'mirage'),
    developmentMode: valueOf(settings, 'development_mode'),
    cacheLevel: valueOf(settings, 'cache_level'),
    browserCacheTtl: valueOf(settings, 'browser_cache_ttl'),
    legacyMinify,
    effectiveAutoMinify: rules.effectiveAutoMinify || hasAllLegacyMinifyOn(legacyMinify)
  };
}

export async function runPerformanceAudit(flags = {}) {
  const site = loadSiteProfile(flags);
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const auth = resolveCloudflareCredential(env, { allowWranglerOauth: true });
  if (!site.zoneName) throw new Error('Missing zone name in site profile or --zone flag.');
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));
  const zone = await resolveZoneByName(auth.token, site.zoneName);

  const [settingResults, configEntrypoint] = await Promise.all([
    Promise.all(PERFORMANCE_SETTINGS.map((setting) => safeCloudflareRequest(auth.token, `/zones/${zone.id}/settings/${setting}`))),
    safeCloudflareRequest(auth.token, `/zones/${zone.id}/rulesets/phases/http_config_settings/entrypoint`)
  ]);
  const settings = summarizeSettings(settingResults);
  const rules = configRulesSummary(configEntrypoint);
  const evaluation = evaluatePosture({ settings, rules });

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `cloudflare-performance-agent-${zone.name.replaceAll('.', '_')}-${utcStamp()}.json`);
  const report = {
    schemaVersion: 'agent-cloudflare-performance-v1',
    status: evaluation.status,
    checkedAt: new Date().toISOString(),
    profile: site.profile.siteId,
    projectRoot: site.projectRoot,
    auth: {
      source: auth.source,
      label: summarizeAuthSource(auth)
    },
    zone: {
      id: zone.id,
      name: zone.name,
      plan: zone.plan?.name || null,
      status: zone.status
    },
    switches: compactSwitches(settings, rules),
    configRules: rules,
    rawSettings: settings,
    actionableIssues: evaluation.actionableIssues,
    externalNoise: evaluation.externalNoise,
    files: {
      agentReport: outputPath
    }
  };

  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return report.status === 'pass' ? 0 : 2;
}
