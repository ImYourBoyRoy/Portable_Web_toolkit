// ./Web_Toolkit/site_quality_smoke/src/commands/run.mjs
/**
 * Runs SEO/performance/header smoke checks for production and development hosts.
 */

import fs from 'node:fs';
import { canonicalFromHtml, assetUrlsFromHtml, metaDescriptionFromHtml, titleFromHtml } from '../lib/extract.mjs';
import { openGraphReport } from '../lib/opengraph.mjs';
import { requestUrl } from '../lib/http.mjs';
import { outputPaths } from '../lib/reports.mjs';
import { resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';
import { renderMarkdown, summarizeReport } from '../lib/summary.mjs';

async function assetReport(urls = []) {
  const results = [];
  for (const url of urls) {
    const response = await requestUrl(url);
    results.push({
      url,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      durationMs: response.durationMs,
      cacheControl: String(response.headers['cache-control'] || ''),
      contentType: String(response.headers['content-type'] || ''),
      contentEncoding: String(response.headers['content-encoding'] || '')
    });
  }
  return results;
}

async function routeReport(origin, routes = []) {
  const checks = [];
  for (const route of routes) {
    const response = await requestUrl(`${origin}${route}`);
    checks.push({
      route,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      durationMs: response.durationMs,
      contentType: String(response.headers['content-type'] || ''),
      cacheControl: String(response.headers['cache-control'] || '')
    });
  }
  return checks;
}

async function sitemapReport(origin, candidates = []) {
  const checks = [];
  for (const route of candidates) {
    const response = await requestUrl(`${origin}${route}`);
    checks.push({
      route,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      durationMs: response.durationMs,
      contentType: String(response.headers['content-type'] || '')
    });
  }
  return checks;
}

async function hostRootReport(host, routes = [], sitemapCandidates = [], assetSampleSize = 3, ogOptions = {}) {
  const normalizedHost = String(host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const origin = `https://${normalizedHost}`;
  const root = await requestUrl(origin);
  const assets = await assetReport(assetUrlsFromHtml(root.body, origin, assetSampleSize));
  const robots = await requestUrl(`${origin}/robots.txt`);
  const sitemapChecks = await sitemapReport(origin, sitemapCandidates);
  const routeChecks = await routeReport(origin, routes);
  const httpRedirect = await requestUrl(`http://${normalizedHost}`, { followRedirects: false });
  return {
    host: normalizedHost,
    origin,
    root: {
      ok: root.status >= 200 && root.status < 400,
      status: root.status,
      durationMs: root.durationMs,
      contentType: String(root.headers['content-type'] || ''),
      contentEncoding: String(root.headers['content-encoding'] || ''),
      cacheControl: String(root.headers['cache-control'] || ''),
      csp: String(root.headers['content-security-policy'] || ''),
      hsts: String(root.headers['strict-transport-security'] || ''),
      referrerPolicy: String(root.headers['referrer-policy'] || ''),
      xFrameOptions: String(root.headers['x-frame-options'] || ''),
      xRobotsTag: String(root.headers['x-robots-tag'] || ''),
      server: String(root.headers.server || ''),
      error: root.error || ''
    },
    title: titleFromHtml(root.body),
    metaDescription: metaDescriptionFromHtml(root.body),
    canonical: canonicalFromHtml(root.body),
    openGraph: await openGraphReport(root.body, { origin, host: normalizedHost, requestUrl, ...ogOptions }),
    robots: {
      ok: robots.status >= 200 && robots.status < 400,
      status: robots.status,
      durationMs: robots.durationMs,
      blocksAll: /disallow:\s*\//i.test(robots.body),
      noindex: /noindex:/i.test(robots.body),
      body: robots.body.slice(0, 400)
    },
    sitemap: sitemapChecks,
    assets,
    routes: routeChecks,
    httpRedirect: {
      status: httpRedirect.status,
      location: String(httpRedirect.headers.location || ''),
      durationMs: httpRedirect.durationMs,
      error: httpRedirect.error || ''
    }
  };
}

function shouldSkipDevelopmentHost(host = '', quality = {}) {
  if (quality.skipDevelopment === true) return true;
  const normalized = String(host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!normalized) return true;
  if (/^localhost(?::\d+)?$/i.test(normalized)) return true;
  if (/^127\.0\.0\.1(?::\d+)?$/i.test(normalized)) return true;
  return false;
}

export async function runQualitySmoke(flags = {}) {
  const resolved = resolveProfile(flags);
  const { profile } = resolved;
  const projectRoot = resolveProjectRoot(flags, resolved);
  const quality = profile.diagnostics?.qualitySmoke || {};
  const routes = Array.isArray(quality.routes) ? quality.routes : ['/'];
  const sitemapCandidates = Array.isArray(quality.sitemapCandidates) ? quality.sitemapCandidates : ['/sitemap-index.xml', '/sitemap.xml'];
  const assetSampleSize = Number(quality.assetSampleSize || 3);
  const thresholds = {
    maxRootDurationMs: Number(quality.maxRootDurationMs || 3000),
    maxRouteDurationMs: Number(quality.maxRouteDurationMs || 3000)
  };
  const productionHost = profile.hosts?.production?.[0];
  const developmentHost = profile.hosts?.development?.[0] || '';
  const workerPreviewHost = quality.workerPreviewHost || '';
  if (!productionHost) {
    throw new Error('Missing profile.hosts.production[0].');
  }

  const skipDevelopment = shouldSkipDevelopmentHost(developmentHost, quality);

  const report = {
    checkedAt: new Date().toISOString(),
    profile: profile.siteId,
    projectRoot,
    thresholds,
    production: await hostRootReport(productionHost, routes, sitemapCandidates, assetSampleSize),
    workerPreview: workerPreviewHost
      ? await hostRootReport(workerPreviewHost, routes, sitemapCandidates, assetSampleSize, { allowCrossHostUrl: true })
      : null,
    development: !skipDevelopment && developmentHost
      ? await hostRootReport(developmentHost, routes, sitemapCandidates, assetSampleSize)
      : null,
    skipped: {
      development: skipDevelopment
        ? (developmentHost ? `Skipped development checks for ${developmentHost}.` : 'No development host configured.')
        : (developmentHost ? '' : 'No development host configured.')
    }
  };
  const summary = summarizeReport(report);
  const paths = outputPaths(projectRoot, profile.siteId);
  fs.mkdirSync(paths.outputDir, { recursive: true });
  fs.writeFileSync(paths.jsonPath, `${JSON.stringify({ ...report, summary }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(paths.mdPath, renderMarkdown(report, summary), 'utf8');

  console.log('\nSite quality smoke');
  console.log(`- Profile: ${profile.siteId}`);
  console.log(`- Overall: ${summary.overall.toUpperCase()}`);
  console.log(`- Report: ${paths.jsonPath}`);
  console.log(`- Markdown: ${paths.mdPath}`);
  return summary.overall === 'warn' ? 2 : 0;
}

