// ./Web_Toolkit/performance_fixes/src/commands/recommend.mjs
/**
 * Reads the latest performance-related reports and turns them into concrete,
 * ordered remediation guidance for agents.
 */

import { latestReport, latestPagespeedReport, readJsonIfExists, resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';

function recommendation(id, risk, summary, command, rationale) {
  return { id, risk, summary, command, rationale };
}

export async function runRecommend(flags = {}) {
  const resolved = resolveProfile(flags);
  const projectRoot = resolveProjectRoot(flags, resolved);
  const quality = readJsonIfExists(latestReport(projectRoot, 'site-quality-smoke-'));
  const browser = readJsonIfExists(latestReport(projectRoot, 'browser-diagnostics-'));
  const pagespeedPath = latestPagespeedReport(projectRoot);
  const pagespeed = readJsonIfExists(pagespeedPath);
  const items = [];

  const productionMetrics = quality?.summary?.metrics?.production || {};
  if (Number(productionMetrics.assetLongCacheWarnings || 0) > 0) {
    items.push(recommendation(
      'immutable-static-cache',
      'low',
      'Versioned /_astro/* assets are not using long-lived immutable caching.',
      `node Web_Toolkit/performance_fixes/bin/performance-fixes.mjs immutable-cache --project-root "${projectRoot}" --apply`,
      'Hashed build assets should normally be cacheable for one year with immutable semantics.'
    ));
  }

  const browserProd = browser?.summary?.metrics?.production || {};
  if (Number(browserProd.failedRequests || 0) > 0) {
    items.push(recommendation(
      'browser-failures',
      'medium',
      'Production browser diagnostics still see blocking request failures.',
      `node Web_Toolkit/browser_diagnostics/bin/browser-diagnostics.mjs run --site-profile "${resolved.profilePath}" --screenshots`,
      'Re-run with screenshots and inspect the failing routes before deploying any fix.'
    ));
  }

  if (pagespeed?.results?.length) {
    for (const result of pagespeed.results) {
      if (!result.ok) continue;
      if (Number(result.performance ?? 1) < 0.9) {
        items.push(recommendation(
          `pagespeed-performance-${result.strategy}`,
          'medium',
          `${result.strategy} performance score is ${result.performance} — rerun PageSpeed after fixes.`,
          `node Web_Toolkit/pagespeed_diagnostics/bin/pagespeed-diagnostics.mjs run --site-profile "${resolved.profilePath}" --strategy ${result.strategy}`,
          'Latest pagespeed-diagnostics report shows sub-90 performance; address LCP/cache/render-blocking items first.'
        ));
      }
      if (Number(result.cacheInsight ?? 1) < 1) {
        items.push(recommendation(
          `pagespeed-cache-${result.strategy}`,
          'low',
          `${result.strategy} cache insight flagged short-lived static assets.`,
          `node Web_Toolkit/performance_fixes/bin/performance-fixes.mjs immutable-cache --project-root "${projectRoot}" --apply`,
          'PageSpeed cache insight reported wasted bytes from short cache lifetimes.'
        ));
      }
    }
  } else if (pagespeedPath) {
    console.warn(`[performance-fixes] Could not parse latest PageSpeed report: ${pagespeedPath}`);
  }

  console.log('\nPerformance remediation recommendations');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- PageSpeed report: ${pagespeedPath || 'none found'}`);
  console.log(`- Recommendations: ${items.length}`);
  if (items.length === 0) {
    console.log('- No performance-specific recommendations were generated from the latest reports.');
    return 0;
  }
  for (const item of items) {
    console.log(`\n[${item.risk.toUpperCase()}] ${item.summary}`);
    console.log(`- Command: ${item.command}`);
    console.log(`- Why: ${item.rationale}`);
  }
  return 0;
}

