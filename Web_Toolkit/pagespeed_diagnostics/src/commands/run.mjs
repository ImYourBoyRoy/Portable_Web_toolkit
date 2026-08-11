// ./Web_Toolkit/pagespeed_diagnostics/src/commands/run.mjs
/**
 * Runs Google PageSpeed Insights API checks for mobile/desktop and extracts actionable
 * Lighthouse diagnostics such as LCP element breakdown, forced reflow, caching, and
 * render-blocking resource hints. Run via `node ./bin/pagespeed-diagnostics.mjs run`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PORTABLE_ROOT, loadEnv, outputPaths, resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';

export function strategies(flagValue = '') {
  const value = String(flagValue || 'both').toLowerCase();
  if (value === 'mobile') return ['mobile'];
  if (value === 'desktop') return ['desktop'];
  return ['mobile', 'desktop'];
}

function categoryScore(result = {}, key) {
  return Number(result?.lighthouseResult?.categories?.[key]?.score ?? 0);
}

function audit(result = {}, key) {
  return result?.lighthouseResult?.audits?.[key] || null;
}

function topDetailItems(auditResult = null, limit = 5) {
  const items = Array.isArray(auditResult?.details?.items) ? auditResult.details.items : [];
  return items.slice(0, limit).map((item) => ({
    url: item?.url || '',
    wastedMs: Number(item?.wastedMs ?? 0),
    wastedBytes: Number(item?.wastedBytes ?? 0),
    totalBytes: Number(item?.totalBytes ?? 0),
    cacheLifetimeMs: Number(item?.cacheLifetimeMs ?? 0)
  }));
}

function cleanSnippet(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function lcpElementSnippet(payload) {
  const lcp = audit(payload, 'largest-contentful-paint') || audit(payload, 'largest-contentful-paint-element');
  const lcpInsight = audit(payload, 'lcp-breakdown-insight') || audit(payload, 'lcp-breakdown');
  const items = Array.isArray(lcpInsight?.details?.items) ? lcpInsight.details.items : [];
  
  // Strategy 1: Check LCP insight items for a 'node' type (often index 1 in PSI v5)
  const insightNode = items.find(i => i.type === 'node' && i.nodeLabel) || items.find(i => i.nodeLabel);
  if (insightNode?.nodeLabel) {
    return cleanSnippet(`${insightNode.nodeLabel} (${insightNode.snippet || 'node'})`);
  }

  // Strategy 2: Standard LCP element snippet fallback
  const details = lcp?.details;
  const lcpItems = Array.isArray(details?.items) ? details.items : [];
  let snippet = lcpItems.find(i => i.node?.snippet)?.node?.snippet || details?.node?.snippet || '';
  
  if (!snippet && lcp?.details?.items?.[0]?.node?.snippet) {
    snippet = lcp.details.items[0].node.snippet;
  }

  if (snippet) return cleanSnippet(snippet);
  
  // Fallback to displayValue if no snippet found
  return cleanSnippet(lcp?.displayValue || 'Unknown');
}

function lcpBreakdown(payload) {
  const insight = audit(payload, 'lcp-breakdown-insight') || audit(payload, 'lcp-breakdown');
  const details = insight?.details;
  
  // If it's a table-style insight, items might be nested inside items[0]
  const items = Array.isArray(details?.items?.[0]?.items) 
    ? details.items[0].items 
    : (Array.isArray(details?.items) ? details.items : []);
    
  if (!items || items.length === 0) return null;
  const ttfb = items.find(i => i.subpart === 'timeToFirstByte')?.duration ?? 0;
  const resLoadDelay = items.find(i => i.subpart === 'resourceLoadDelay')?.duration ?? 0;
  const resLoadDuration = items.find(i => i.subpart === 'resourceLoadDuration')?.duration ?? 0;
  const renderDelay = items.find(i => i.subpart === 'elementRenderDelay')?.duration ?? 0;
  return {
    ttfbMs: ttfb,
    resourceLoadDelayMs: resLoadDelay,
    resourceLoadDurationMs: resLoadDuration,
    elementRenderDelayMs: renderDelay
  };
}

function lcpResourceDiscovery(payload) {
  const insight = audit(payload, 'lcp-discovery-insight');
  const items = Array.isArray(insight?.details?.items) ? insight.details.items : [];
  return items.map(item => ({
    url: item.url || '',
    type: item.resourceType || '',
    requestPriority: item.requestPriority || '',
    priorityHint: item.priorityHint || ''
  }));
}

function forcedReflowItems(payload, limit = 10) {
  const insight = audit(payload, 'forced-reflow-insight') || audit(payload, 'forced-reflow');
  const details = insight?.details;
  const items = Array.isArray(details?.items) ? details.items : [];
  
  return items.slice(0, limit).map((item) => {
    // Structural mapping for newer PSI insight results
    const source = item.source || {};
    const url = source.url || item.url || '';
    const lineStr = (source.line !== undefined) ? `:${source.line}:${source.column || 0}` : '';
    const location = url ? `${url}${lineStr}` : '';
    const time = item.reflowTime ?? item.totalReflowTime ?? item.duration ?? 0;
    
    return {
      url: location || '[unattributed]',
      totalReflowTimeMs: Number(time)
    };
  }).filter(i => i.totalReflowTimeMs > 0 || i.url !== '[unattributed]');
}

function domSizeMetrics(payload) {
  const domAudit = audit(payload, 'dom-size') || audit(payload, 'dom-size-insight');
  if (!domAudit) return null;
  const items = Array.isArray(domAudit?.details?.items) ? domAudit.details.items : [];
  return items.map((i) => ({
    statistic: String(i?.statistic || i?.label || ''),
    value: String(i?.value?.value ?? i?.value ?? ''),
    snippet: String(i?.node?.snippet || '')
  })).filter(i => i.statistic && i.value !== '');
}

function networkRequestsMetrics(payload) {
  const reqsAudit = audit(payload, 'network-requests');
  const items = Array.isArray(reqsAudit?.details?.items) ? reqsAudit.details.items : [];
  return items.slice(0, 10).map((idx) => ({
    url: String(idx.url || ''),
    protocol: String(idx.protocol || ''),
    statusCode: Number(idx.statusCode ?? 0),
    priority: String(idx.priority || ''),
    mimeType: String(idx.mimeType || ''),
    resourceType: String(idx.resourceType || ''),
    resourceSize: Number(idx.resourceSize ?? 0),
    transferSize: Number(idx.transferSize ?? 0),
    requestTimeMs: Number(idx.networkRequestTime ?? 0),
    endTimeMs: Number(idx.networkEndTime ?? 0)
  }));
}

function layoutShiftCulprits(payload, limit = 10) {
  const insight = audit(payload, 'cls-culprits-insight') || audit(payload, 'layout-shifts');
  const details = insight?.details;
  const items = Array.isArray(details?.items) ? details.items : [];
  return items.slice(0, limit).map((item) => {
    const score = Number(item?.score ?? item?.layoutShiftScore ?? 0);
    const node = item.node || {};
    const snippet = node.nodeLabel || node.snippet || item.description || 'Unattributed Shift';
    return { score, snippet };
  });
}

export function summarizeOne(strategy, payload) {
  if (!payload?.lighthouseResult) {
    return {
      strategy,
      ok: false,
      error: payload?.error?.message || 'No Lighthouse result returned.'
    };
  }
  const recs = [];
  const cache = audit(payload, 'cache-insight');
  const renderBlocking = audit(payload, 'render-blocking-insight');
  const imageDelivery = audit(payload, 'image-delivery-insight') || audit(payload, 'uses-optimized-images');
  const forcedReflow = audit(payload, 'forced-reflow');
  const lcpParts = lcpBreakdown(payload);
  if (Number(cache?.score ?? 1) < 1) recs.push('Improve static-asset caching lifetimes.');
  if (Number(renderBlocking?.score ?? 1) < 1) recs.push('Reduce render-blocking CSS/font work on the critical path.');
  if (Number(imageDelivery?.score ?? 1) < 1) recs.push('Improve image delivery/compression for LCP and FCP.');
  if (Number(forcedReflow?.score ?? 1) < 1) recs.push('Reduce forced reflow in the shared enhancement script.');
  if (Number(lcpParts?.elementRenderDelayMs ?? 0) > 250) recs.push('Reduce LCP element render delay in the hero.');

  // Auto-discover Failing Accessibility/SEO Audits
  const failures = [];
  const allAudits = payload?.lighthouseResult?.audits || {};
  Object.values(allAudits).forEach(a => {
    // Capture logical failures (score < 1)
    // We include SEO, Accessibility, and Best Practices
    if (a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'informative') {
      const items = a.details?.items || [];
      const firstSnippet = items[0]?.node?.snippet || items[0]?.node?.nodeLabel || '';
      failures.push({
        title: a.title,
        description: a.description.split('.')[0],
        snippet: firstSnippet ? cleanSnippet(firstSnippet) : null
      });
    }
  });

  return {
    strategy,
    ok: true,
    performance: categoryScore(payload, 'performance'),
    accessibility: categoryScore(payload, 'accessibility'),
    bestPractices: categoryScore(payload, 'best-practices'),
    seo: categoryScore(payload, 'seo'),
    speedIndexMs: Number(audit(payload, 'speed-index')?.numericValue ?? 0),
    fcpMs: Number(audit(payload, 'first-contentful-paint')?.numericValue ?? 0),
    lcpMs: Number(audit(payload, 'largest-contentful-paint')?.numericValue ?? 0),
    tbtMs: Number(audit(payload, 'total-blocking-time')?.numericValue ?? 0),
    cls: Number(audit(payload, 'cumulative-layout-shift')?.numericValue ?? 0),
    cacheInsight: Number(cache?.score ?? 0),
    renderBlockingInsight: Number(renderBlocking?.score ?? 0),
    imageDeliveryInsight: Number(imageDelivery?.score ?? 0),
    forcedReflowInsight: Number(forcedReflow?.score ?? 0),
    lcpElement: lcpElementSnippet(payload),
    lcpBreakdown: lcpParts,
    lcpResources: lcpResourceDiscovery(payload),
    cacheItems: topDetailItems(cache),
    renderBlockingItems: topDetailItems(renderBlocking),
    imageDeliveryItems: topDetailItems(imageDelivery),
    forcedReflowItems: forcedReflowItems(payload),
    layoutShiftItems: layoutShiftCulprits(payload),
    domSizeItems: domSizeMetrics(payload),
    networkRequestItems: networkRequestsMetrics(payload),
    recommendations: recs,
    failures,
  };
}

export async function requestPageSpeed(url, strategy, apiKey) {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', strategy);
  for (const category of ['performance', 'accessibility', 'best-practices', 'seo']) {
    endpoint.searchParams.append('category', category);
  }
  if (apiKey) endpoint.searchParams.set('key', apiKey);
  const response = await fetch(endpoint);
  return response.json();
}

export async function runPageSpeed(flags = {}) {
  const resolved = resolveProfile(flags);
  const projectRoot = resolveProjectRoot(flags, resolved);
  const projectEnv = loadEnv(path.join(projectRoot, '.env'));
  const portableEnv = loadEnv(path.join(PORTABLE_ROOT, '.env'));
  const apiKey = String(flags['api-key'] || projectEnv.GOOGLE_PAGESPEED_API_KEY || projectEnv.PAGESPEED_API_KEY || portableEnv.GOOGLE_PAGESPEED_API_KEY || process.env.GOOGLE_PAGESPEED_API_KEY || '').trim();
  const url = String(flags.url || `https://${resolved.profile.hosts.production[0]}`);
  const paths = outputPaths(projectRoot, resolved.profile.siteId);
  const stamp = path.basename(paths.jsonPath)
    .replace(`pagespeed-diagnostics-${resolved.profile.siteId}-`, '')
    .replace(/\.json$/, '');
  const results = [];
  const rawPaths = [];

  for (const strategy of strategies(flags.strategy)) {
    const payload = await requestPageSpeed(url, strategy, apiKey);
    const summary = summarizeOne(strategy, payload);
    results.push(summary);

    const rawPath = path.join(paths.outputDir, `pagespeed-raw-${resolved.profile.siteId}-${strategy}-${stamp}.json`);
    fs.mkdirSync(paths.outputDir, { recursive: true });
    fs.writeFileSync(rawPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    rawPaths.push({ strategy, rawPath });
  }

  const report = {
    checkedAt: new Date().toISOString(),
    profile: resolved.profile.siteId,
    projectRoot,
    url,
    usedApiKey: Boolean(apiKey),
    results,
    rawPaths: rawPaths.map((entry) => ({ strategy: entry.strategy, path: entry.rawPath })),
  };
  fs.mkdirSync(paths.outputDir, { recursive: true });
  fs.writeFileSync(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const lines = ['# PageSpeed Diagnostics', '', `- Checked at: ${report.checkedAt}`, `- URL: ${url}`, `- API key used: ${report.usedApiKey}`, ''];
  for (const result of results) {
    lines.push(`## ${result.strategy}`, '');
    if (!result.ok) {
      lines.push(`- Error: ${result.error}`, '');
      continue;
    }
    lines.push(`- Performance: ${result.performance}`);
    lines.push(`- Accessibility: ${result.accessibility}`);
    lines.push(`- Best Practices: ${result.bestPractices}`);
    lines.push(`- SEO: ${result.seo}`);
    lines.push(`- Speed Index: ${Math.round(result.speedIndexMs)} ms`);
    lines.push(`- FCP: ${Math.round(result.fcpMs)} ms`);
    lines.push(`- LCP: ${Math.round(result.lcpMs)} ms`);
    lines.push(`- TBT: ${Math.round(result.tbtMs)} ms`);
    lines.push(`- CLS: ${result.cls}`);
    if (result.lcpElement) {
      lines.push('- LCP Element:', `  - \`${result.lcpElement}\``);
    }
    if (result.lcpBreakdown) {
      lines.push('- LCP Breakdown:');
      lines.push(`  - TTFB: ${Math.round(result.lcpBreakdown.ttfbMs)} ms`);
      lines.push(`  - Resource Load Delay: ${Math.round(result.lcpBreakdown.resourceLoadDelayMs)} ms`);
      lines.push(`  - Resource Load Duration: ${Math.round(result.lcpBreakdown.resourceLoadDurationMs)} ms`);
      lines.push(`  - Element Render Delay: ${Math.round(result.lcpBreakdown.elementRenderDelayMs)} ms`);
    }
    if (result.lcpResources && result.lcpResources.length > 0) {
      lines.push('- LCP Resource Candidate:');
      for (const res of result.lcpResources) {
        lines.push(`  - \`${res.url}\` (${res.type}, Priority: ${res.requestPriority})`);
      }
    }
    if (result.layoutShiftItems && result.layoutShiftItems.length > 0) {
      lines.push('- Layout Shift Culprits:');
      for (const item of result.layoutShiftItems) {
        lines.push(`  - Score ${item.score.toFixed(4)}: \`${cleanSnippet(item.snippet)}\``);
      }
    }
    if (result.domSizeItems && result.domSizeItems.length > 0) {
        lines.push('- DOM Size Metrics:');
        for (const item of result.domSizeItems) {
          lines.push(`  - ${item.statistic}: ${item.value} ${item.snippet ? `(\`${cleanSnippet(item.snippet)}\`)` : ''}`);
        }
    }
    if (result.networkRequestItems && result.networkRequestItems.length > 0) {
        lines.push('- Network Requests (Top 10):');
        for (const item of result.networkRequestItems) {
          const transferKB = (item.transferSize / 1024).toFixed(2);
          const resourceKB = (item.resourceSize / 1024).toFixed(2);
          const reqMs = item.requestTimeMs.toFixed(1);
          const endMs = item.endTimeMs.toFixed(1);
          lines.push(`  - \`${item.url}\``);
          lines.push(`    - Status: ${item.statusCode} | Priority: ${item.priority} | Protocol: ${item.protocol}`);
          lines.push(`    - Type: ${item.mimeType} (${item.resourceType})`);
          lines.push(`    - Size: ${transferKB} KB Transfer / ${resourceKB} KB Resource`);
          lines.push(`    - Timing: Req ${reqMs} ms -> End ${endMs} ms (Duration: ${(item.endTimeMs - item.requestTimeMs).toFixed(1)} ms)`);
        }
    }
    for (const rec of result.recommendations) lines.push(`- Recommendation: ${rec}`);
    if (result.cacheItems.length > 0) {
      lines.push('- Top cache culprits:');
      for (const item of result.cacheItems) {
        lines.push(`  - ${item.url} (cache lifetime ${Math.round(item.cacheLifetimeMs / 1000)}s, wasted bytes ${Math.round(item.wastedBytes)})`);
      }
    }
    if (result.renderBlockingItems.length > 0) {
      lines.push('- Top render-blocking culprits:');
      for (const item of result.renderBlockingItems) {
        lines.push(`  - ${item.url} (wasted ${Math.round(item.wastedMs)} ms, ${Math.round(item.totalBytes)} bytes)`);
      }
    }
    if (result.imageDeliveryItems.length > 0) {
      lines.push('- Top image-delivery culprits:');
      for (const item of result.imageDeliveryItems) {
        lines.push(`  - ${item.url} (${Math.round(item.totalBytes)} bytes, est savings ${Math.round(item.wastedBytes)} bytes)`);
      }
    }

    if (result.failures && result.failures.length > 0) {
      lines.push('- **Critical Failures / Mismatches**:');
      for (const fail of result.failures) {
        lines.push(`  - **${fail.title}**: ${fail.description}.`);
        if (fail.snippet) lines.push(`    - Affected: \`${fail.snippet}\``);
      }
    }
    if (result.forcedReflowItems.length > 0) {
      lines.push('- Forced reflow sources:');
      for (const item of result.forcedReflowItems) {
        lines.push(`  - ${item.url || '[unattributed]'} (${item.totalReflowTimeMs.toFixed(1)} ms)`);
      }
    }
    
    const rawEntry = rawPaths.find((entry) => entry.strategy === result.strategy);
    if (rawEntry) {
      const rawFilename = path.basename(rawEntry.rawPath);
      lines.push('', `> [Raw Audit Data Available: ${rawFilename}](./${rawFilename})`);
    }

    lines.push('');

  }
  fs.writeFileSync(paths.mdPath, `${lines.join('\n')}\n`, 'utf8');

  console.log('\nPageSpeed diagnostics');
  console.log(`- URL: ${url}`);
  console.log(`- Strategies: ${results.map((item) => item.strategy).join(', ')}`);
  console.log(`- Report: ${paths.jsonPath}`);
  console.log(`- Markdown: ${paths.mdPath}`);
  return results.some((item) => !item.ok) ? 2 : 0;
}

