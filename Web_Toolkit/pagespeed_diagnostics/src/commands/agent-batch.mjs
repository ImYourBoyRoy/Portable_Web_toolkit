// ./Web_Toolkit/pagespeed_diagnostics/src/commands/agent-batch.mjs
/**
 * AI-agent-first PageSpeed batch runner. It emits compact machine-readable JSON,
 * writes raw PSI payloads to files, and reports only score/metric regressions or
 * actionable failures. Run via `node ./bin/pagespeed-diagnostics.mjs agent-batch`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PORTABLE_ROOT, loadEnv, resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';
import { requestPageSpeed, strategies, summarizeOne } from './run.mjs';

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function csv(value = '') {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function safeSlug(value = '') {
  return String(value || 'root')
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .toLowerCase() || 'root';
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function productionOrigin(profile) {
  const host = profile?.hosts?.production?.[0];
  if (!host) throw new Error('Missing profile.hosts.production[0].');
  return `https://${host}`;
}

function routesFromProfile(profile, mode = 'core') {
  const browserRoutes = profile?.diagnostics?.browserDiagnostics?.routes;
  const smokeRoutes = profile?.diagnostics?.qualitySmoke?.routes;
  const configured = Array.isArray(browserRoutes) && browserRoutes.length > 0
    ? browserRoutes
    : Array.isArray(smokeRoutes) && smokeRoutes.length > 0
      ? smokeRoutes
      : ['/'];
  if (mode === 'root') return ['/'];
  return configured;
}

function requestedUrls(flags, profile) {
  if (flags.urls) return unique(csv(flags.urls));
  if (flags.url) return [String(flags.url)];

  const origin = productionOrigin(profile);
  const routesFlag = String(flags.routes || 'core').trim();
  const routes = ['core', 'profile', 'all', 'root'].includes(routesFlag.toLowerCase())
    ? routesFromProfile(profile, routesFlag.toLowerCase())
    : csv(routesFlag);

  return unique(routes.map((route) => {
    if (/^https?:\/\//i.test(route)) return route;
    const normalized = route.startsWith('/') ? route : `/${route}`;
    return new URL(normalized, origin).toString();
  }));
}

async function canonicalizeUrl(url, enabled = true) {
  if (!enabled) return { input: url, url, redirected: false };
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    if (![301, 302, 307, 308].includes(response.status)) {
      return { input: url, url, redirected: false, status: response.status };
    }
    const location = response.headers.get('location');
    if (!location) return { input: url, url, redirected: false, status: response.status };
    const resolved = new URL(location, url).toString();
    const sameOrigin = new URL(resolved).origin === new URL(url).origin;
    return {
      input: url,
      url: sameOrigin ? resolved : url,
      redirected: sameOrigin,
      status: response.status,
      location: resolved
    };
  } catch (error) {
    return {
      input: url,
      url,
      redirected: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function defaultThresholds(profile, flags = {}) {
  const browser = profile?.diagnostics?.browserDiagnostics || {};
  return {
    minScore: Number(flags['min-score'] ?? 1),
    maxFcpMs: Number(flags['max-fcp-ms'] ?? browser.maxFcpMs ?? 1800),
    maxLcpMs: Number(flags['max-lcp-ms'] ?? browser.maxLcpMs ?? 2500),
    maxSpeedIndexMs: Number(flags['max-speed-index-ms'] ?? 3400),
    maxTbtMs: Number(flags['max-tbt-ms'] ?? 200),
    maxCls: Number(flags['max-cls'] ?? browser.maxCls ?? 0.1)
  };
}

function metricIssue({ url, strategy, metric, value, threshold, unit = 'ms' }) {
  return {
    severity: 'fail',
    url,
    strategy,
    code: `metric-${metric.toLowerCase()}-over-threshold`,
    summary: `${metric} is ${Math.round(value)}${unit} over target ${threshold}${unit}.`,
    evidence: { metric, value, threshold, unit }
  };
}

function scoreIssues(url, strategy, result, thresholds) {
  const categories = [
    ['performance', result.performance],
    ['accessibility', result.accessibility],
    ['best-practices', result.bestPractices],
    ['seo', result.seo]
  ];
  return categories
    .filter(([, value]) => Number(value) < thresholds.minScore)
    .map(([category, value]) => ({
      severity: 'fail',
      url,
      strategy,
      code: `score-${category}-below-target`,
      summary: `${category} score ${value} is below target ${thresholds.minScore}.`,
      evidence: { category, value, threshold: thresholds.minScore }
    }));
}

function thresholdIssues(url, strategy, result, thresholds) {
  const issues = [];
  if (Number(result.fcpMs) > thresholds.maxFcpMs) {
    issues.push(metricIssue({ url, strategy, metric: 'FCP', value: result.fcpMs, threshold: thresholds.maxFcpMs }));
  }
  if (Number(result.lcpMs) > thresholds.maxLcpMs) {
    issues.push(metricIssue({ url, strategy, metric: 'LCP', value: result.lcpMs, threshold: thresholds.maxLcpMs }));
  }
  if (Number(result.speedIndexMs) > thresholds.maxSpeedIndexMs) {
    issues.push(metricIssue({ url, strategy, metric: 'SpeedIndex', value: result.speedIndexMs, threshold: thresholds.maxSpeedIndexMs }));
  }
  if (Number(result.tbtMs) > thresholds.maxTbtMs) {
    issues.push(metricIssue({ url, strategy, metric: 'TBT', value: result.tbtMs, threshold: thresholds.maxTbtMs }));
  }
  if (Number(result.cls) > thresholds.maxCls) {
    issues.push(metricIssue({ url, strategy, metric: 'CLS', value: result.cls, threshold: thresholds.maxCls, unit: '' }));
  }
  return issues;
}

function cacheNoise(url, strategy, item) {
  const itemUrl = String(item?.url || '');
  if (!/static\.cloudflareinsights\.com\/beacon/i.test(itemUrl)) return null;
  return {
    url,
    strategy,
    code: 'cloudflare-analytics-beacon-cache-lifetime',
    summary: 'Cloudflare Analytics beacon cache lifetime is external/unactionable for site code.',
    evidence: {
      culpritUrl: itemUrl,
      cacheLifetimeSeconds: Math.round(Number(item.cacheLifetimeMs || 0) / 1000),
      wastedBytes: Math.round(Number(item.wastedBytes || 0))
    }
  };
}

function failureIssues(url, strategy, result) {
  return (result.failures || [])
    .filter((failure) => failure?.title)
    .map((failure) => ({
      severity: 'fail',
      url,
      strategy,
      code: `lighthouse-${safeSlug(failure.title)}`,
      summary: failure.title,
      evidence: {
        description: failure.description,
        snippet: failure.snippet
      }
    }));
}

function compactCheck(url, strategy, result, rawPath) {
  return {
    url,
    strategy,
    ok: Boolean(result.ok),
    scores: result.ok
      ? {
          performance: result.performance,
          accessibility: result.accessibility,
          bestPractices: result.bestPractices,
          seo: result.seo
        }
      : null,
    metrics: result.ok
      ? {
          fcpMs: Math.round(result.fcpMs),
          lcpMs: Math.round(result.lcpMs),
          speedIndexMs: Math.round(result.speedIndexMs),
          tbtMs: Math.round(result.tbtMs),
          cls: result.cls
        }
      : null,
    lcp: result.ok
      ? {
          element: result.lcpElement || '',
          breakdown: result.lcpBreakdown || null
        }
      : null,
    rawPath
  };
}

function compactKey(issue) {
  return [issue.url, issue.strategy, issue.code, issue.summary].join('|');
}

function uniqueObjects(items = [], keyFn = compactKey) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function minScore(checks, category) {
  const values = checks
    .map((check) => check?.scores?.[category])
    .filter((value) => Number.isFinite(Number(value)));
  return values.length ? Math.min(...values.map(Number)) : null;
}

export async function runAgentBatch(flags = {}) {
  const resolved = resolveProfile(flags);
  const projectRoot = resolveProjectRoot(flags, resolved);
  const projectEnv = loadEnv(path.join(projectRoot, '.env'));
  const portableEnv = loadEnv(path.join(PORTABLE_ROOT, '.env'));
  const apiKey = String(flags['api-key'] || projectEnv.GOOGLE_PAGESPEED_API_KEY || projectEnv.PAGESPEED_API_KEY || portableEnv.GOOGLE_PAGESPEED_API_KEY || process.env.GOOGLE_PAGESPEED_API_KEY || '').trim();
  const outputDir = path.join(projectRoot, 'output');
  const timestamp = stamp();
  const thresholds = defaultThresholds(resolved.profile, flags);
  const canonicalize = toBool(flags.canonicalize, true);
  const saveRaw = toBool(flags['save-raw'], true);
  const checks = [];
  const rawPaths = [];
  const actionableIssues = [];
  const externalNoise = [];

  fs.mkdirSync(outputDir, { recursive: true });
  const canonicalUrls = [];
  for (const inputUrl of requestedUrls(flags, resolved.profile)) {
    canonicalUrls.push(await canonicalizeUrl(inputUrl, canonicalize));
  }

  for (const urlInfo of canonicalUrls) {
    for (const strategy of strategies(flags.strategy || 'mobile')) {
      const payload = await requestPageSpeed(urlInfo.url, strategy, apiKey);
      const rawPath = saveRaw
        ? path.join(outputDir, `pagespeed-raw-${resolved.profile.siteId}-${strategy}-${timestamp}-${safeSlug(urlInfo.url)}.json`)
        : '';
      if (saveRaw) {
        fs.writeFileSync(rawPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        rawPaths.push(rawPath);
      }
      const summary = summarizeOne(strategy, payload);
      const compact = compactCheck(urlInfo.url, strategy, summary, rawPath);
      checks.push({
        ...compact,
        inputUrl: urlInfo.input,
        canonicalized: urlInfo.redirected
      });

      if (!summary.ok) {
        actionableIssues.push({
          severity: 'fail',
          url: urlInfo.url,
          strategy,
          code: 'psi-no-lighthouse-result',
          summary: summary.error || 'No Lighthouse result returned.',
          evidence: { rawPath }
        });
        continue;
      }

      const currentIssues = [
        ...scoreIssues(urlInfo.url, strategy, summary, thresholds),
        ...thresholdIssues(urlInfo.url, strategy, summary, thresholds)
      ];
      if (currentIssues.length > 0) {
        currentIssues.push(...failureIssues(urlInfo.url, strategy, summary));
      }
      actionableIssues.push(...currentIssues);
      for (const item of summary.cacheItems || []) {
        const noise = cacheNoise(urlInfo.url, strategy, item);
        if (noise) externalNoise.push(noise);
      }
    }
  }

  const issues = uniqueObjects(actionableIssues);
  const noise = uniqueObjects(externalNoise, (item) => `${item.code}|${item.evidence?.culpritUrl || ''}`);
  const status = issues.length > 0 ? 'fail' : 'pass';
  const failedCheckKeys = new Set(issues.map((issue) => `${issue.url}|${issue.strategy}`));
  const agentReportPath = path.join(outputDir, `pagespeed-agent-batch-${resolved.profile.siteId}-${timestamp}.json`);
  const report = {
    schemaVersion: 'agent-pagespeed-batch-v1',
    status,
    checkedAt: new Date().toISOString(),
    profile: resolved.profile.siteId,
    projectRoot,
    usedApiKey: Boolean(apiKey),
    strategy: flags.strategy || 'mobile',
    thresholds,
    stats: {
      urls: unique(checks.map((check) => check.url)).length,
      checks: checks.length,
      failedChecks: failedCheckKeys.size,
      actionableIssueCount: issues.length,
      minScores: {
        performance: minScore(checks, 'performance'),
        accessibility: minScore(checks, 'accessibility'),
        bestPractices: minScore(checks, 'bestPractices'),
        seo: minScore(checks, 'seo')
      }
    },
    checks,
    actionableIssues: issues,
    externalNoise: noise,
    files: {
      agentReport: agentReportPath,
      rawReports: rawPaths
    }
  };

  fs.writeFileSync(agentReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return status === 'pass' ? 0 : 2;
}
