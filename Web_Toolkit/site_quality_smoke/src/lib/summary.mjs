// ./Web_Toolkit/site_quality_smoke/src/lib/summary.mjs
/**
 * Summary and diff helpers for site-quality-smoke.
 */

import { hasStrongStaticAssetCache, isVersionedStaticAsset } from './cache.mjs';

function isHttpsRedirect(check = {}) {
  return [301, 302, 307, 308].includes(Number(check.status || 0)) && String(check.location || '').startsWith('https://');
}

function canonicalMatchesHost(canonical = '', host = '') {
  if (!canonical || !host) return false;
  try {
    return new URL(canonical).hostname === host;
  } catch {
    return false;
  }
}

function slowEntries(entries = [], threshold = 3000) {
  return entries.filter((entry) => Number(entry.durationMs || 0) > threshold);
}

function hostMetrics(host = {}, thresholds = {}) {
  const routes = Array.isArray(host.routes) ? host.routes : [];
  const assets = Array.isArray(host.assets) ? host.assets : [];
  const sitemap = Array.isArray(host.sitemap) ? host.sitemap : [];
  return {
    routeFailures: routes.filter((entry) => !entry.ok).length,
    slowRoutes: slowEntries(routes, thresholds.maxRouteDurationMs).length,
    assetCacheWarnings: assets.filter((entry) => !String(entry.cacheControl || '').trim()).length,
    assetLongCacheWarnings: assets.filter((entry) => isVersionedStaticAsset(entry.url) && !hasStrongStaticAssetCache(entry.cacheControl)).length,
    assetEncodingWarnings: assets.filter((entry) => !String(entry.contentEncoding || '').trim()).length,
    sitemapOk: sitemap.some((entry) => entry.ok),
    rootSlow: Number(host.root?.durationMs || 0) > Number(thresholds.maxRootDurationMs || 3000)
  };
}

function pushIssue(issues, condition, message) {
  if (condition) issues.push(message);
}

export function summarizeReport(report = {}) {
  const thresholds = report.thresholds || {};
  const production = report.production || {};
  const development = report.development || null;
  const hasDevelopment = Boolean(development?.host);
  const productionMetrics = hostMetrics(production, thresholds);
  const developmentMetrics = hasDevelopment ? hostMetrics(development, thresholds) : {
    routeFailures: 0,
    slowRoutes: 0,
    assetCacheWarnings: 0,
    assetLongCacheWarnings: 0,
    assetEncodingWarnings: 0,
    sitemapOk: true,
    rootSlow: false,
    skipped: true
  };
  const issues = [];

  pushIssue(issues, !production.root?.ok, 'Production root did not return a successful response.');
  pushIssue(issues, !production.title, 'Production title tag is missing.');
  pushIssue(issues, !production.metaDescription, 'Production meta description is missing.');
  pushIssue(issues, !production.canonical, 'Production canonical link is missing.');
  pushIssue(issues, production.canonical && !canonicalMatchesHost(production.canonical, production.host), 'Production canonical host does not match the expected production host.');
  pushIssue(issues, !production.robots?.ok, 'Production robots.txt is missing or failing.');
  pushIssue(issues, !productionMetrics.sitemapOk, 'Production sitemap is missing or failing.');
  pushIssue(issues, !String(production.root?.csp || '').trim(), 'Production root is missing a Content-Security-Policy header.');
  pushIssue(issues, !String(production.root?.hsts || '').trim(), 'Production root is missing a Strict-Transport-Security header.');
  pushIssue(issues, !isHttpsRedirect(production.httpRedirect), 'Production HTTP endpoint is not redirecting cleanly to HTTPS.');
  pushIssue(issues, productionMetrics.routeFailures > 0, `Production route failures detected: ${productionMetrics.routeFailures}.`);
  pushIssue(issues, productionMetrics.rootSlow, `Production root exceeded ${thresholds.maxRootDurationMs}ms.`);
  pushIssue(issues, productionMetrics.slowRoutes > 0, `Production routes exceeded ${thresholds.maxRouteDurationMs}ms: ${productionMetrics.slowRoutes}.`);
  pushIssue(issues, productionMetrics.assetCacheWarnings > 0, `Asset cache headers missing on ${productionMetrics.assetCacheWarnings} sampled assets.`);
  pushIssue(issues, productionMetrics.assetLongCacheWarnings > 0, `Versioned production assets are not using long-lived immutable caching on ${productionMetrics.assetLongCacheWarnings} sampled assets.`);

  if (hasDevelopment) {
    pushIssue(issues, !development.root?.ok, 'Development root did not return a successful response.');
    pushIssue(issues, !String(development.root?.xRobotsTag || '').toLowerCase().includes('noindex'), 'Development root is missing X-Robots-Tag noindex protection.');
    pushIssue(issues, !development.robots?.blocksAll, 'Development robots.txt does not disallow crawling.');
    pushIssue(issues, !isHttpsRedirect(development.httpRedirect), 'Development HTTP endpoint is not redirecting cleanly to HTTPS.');
    pushIssue(issues, developmentMetrics.routeFailures > 0, `Development route failures detected: ${developmentMetrics.routeFailures}.`);
    pushIssue(issues, developmentMetrics.rootSlow, `Development root exceeded ${thresholds.maxRootDurationMs}ms.`);
    pushIssue(issues, developmentMetrics.slowRoutes > 0, `Development routes exceeded ${thresholds.maxRouteDurationMs}ms: ${developmentMetrics.slowRoutes}.`);
  }

  return {
    overall: issues.length > 0 ? 'warn' : 'pass',
    issues,
    metrics: {
      production: productionMetrics,
      development: developmentMetrics
    }
  };
}

function hostSnapshot(host = {}) {
  return {
    root: {
      status: host.root?.status || 0,
      durationMs: host.root?.durationMs || 0,
      cacheControl: host.root?.cacheControl || '',
      csp: host.root?.csp || '',
      hsts: host.root?.hsts || '',
      referrerPolicy: host.root?.referrerPolicy || '',
      xFrameOptions: host.root?.xFrameOptions || '',
      xRobotsTag: host.root?.xRobotsTag || ''
    },
    title: host.title || '',
    metaDescription: host.metaDescription || '',
    canonical: host.canonical || '',
    robotsOk: Boolean(host.robots?.ok),
    sitemap: (host.sitemap || []).map((entry) => ({ route: entry.route, status: entry.status, ok: entry.ok })),
    routes: (host.routes || []).map((entry) => ({ route: entry.route, status: entry.status, durationMs: entry.durationMs })),
    httpRedirect: {
      status: host.httpRedirect?.status || 0,
      location: host.httpRedirect?.location || ''
    },
    assets: (host.assets || []).map((entry) => ({
      path: (() => { try { return new URL(entry.url).pathname; } catch { return entry.url; } })(),
      status: entry.status,
      cacheControl: entry.cacheControl,
      contentEncoding: entry.contentEncoding,
      contentType: entry.contentType
    }))
  };
}

function pushChange(changes, label, before, after) {
  const beforeJson = JSON.stringify(before);
  const afterJson = JSON.stringify(after);
  if (beforeJson !== afterJson) {
    changes.push({ label, before, after });
  }
}

export function renderMarkdown(report = {}, summary = summarizeReport(report)) {
  const lines = [
    '# Site Quality Smoke',
    '',
    `- Checked at: ${report.checkedAt}`,
    `- Profile: ${report.profile}`,
    `- Overall: ${summary.overall.toUpperCase()}`,
    '',
    '## Host Summary',
    '',
    '| Host | Root status | Root ms | Routes failing | Sitemap OK | HTTP→HTTPS |',
    '| --- | --- | --- | --- | --- | --- |',
    `| ${report.production?.host || 'production'} | ${report.production?.root?.status || 0} | ${report.production?.root?.durationMs || 0} | ${summary.metrics.production.routeFailures} | ${summary.metrics.production.sitemapOk} | ${isHttpsRedirect(report.production?.httpRedirect)} |`,
    ...(report.development?.host ? [`| ${report.development.host} | ${report.development.root?.status || 0} | ${report.development.root?.durationMs || 0} | ${summary.metrics.development.routeFailures} | ${summary.metrics.development.sitemapOk} | ${isHttpsRedirect(report.development.httpRedirect)} |`] : [`| development | skipped | 0 | 0 | skipped | skipped |`]),
    '',
    '## Issues',
    ''
  ];
  if (summary.issues.length === 0) {
    lines.push('- No issues detected.');
  } else {
    for (const issue of summary.issues) lines.push(`- ${issue}`);
  }
  lines.push('', '## Sampled Assets', '');
  for (const asset of report.production?.assets || []) {
    lines.push(`- ${asset.url} | status=${asset.status} | cache-control=${asset.cacheControl || 'missing'} | immutable-cache=${hasStrongStaticAssetCache(asset.cacheControl)} | encoding=${asset.contentEncoding || 'none'}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function diffReports(current = {}, previous = {}) {
  const changes = [];
  pushChange(changes, 'production', hostSnapshot(previous.production), hostSnapshot(current.production));
  if (previous.development?.host || current.development?.host) {
    pushChange(changes, 'development', hostSnapshot(previous.development), hostSnapshot(current.development));
  }
  pushChange(changes, 'thresholds', previous.thresholds || {}, current.thresholds || {});
  return {
    current: {
      checkedAt: current.checkedAt,
      overall: summarizeReport(current).overall
    },
    previous: {
      checkedAt: previous.checkedAt,
      overall: summarizeReport(previous).overall
    },
    changed: changes.length > 0,
    changes
  };
}

