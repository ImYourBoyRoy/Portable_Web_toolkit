// ./Web_Toolkit/performance_fixes/src/commands/recommend.mjs
/**
 * Reads the latest performance-related reports and turns them into concrete,
 * ordered remediation guidance for agents.
 */

import { latestReport, readJsonIfExists, resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';

function recommendation(id, risk, summary, command, rationale) {
  return { id, risk, summary, command, rationale };
}

export async function runRecommend(flags = {}) {
  const resolved = resolveProfile(flags);
  const projectRoot = resolveProjectRoot(flags, resolved);
  const quality = readJsonIfExists(latestReport(projectRoot, 'site-quality-smoke-'));
  const browser = readJsonIfExists(latestReport(projectRoot, 'browser-diagnostics-'));
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

  console.log('\nPerformance remediation recommendations');
  console.log(`- Project root: ${projectRoot}`);
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

