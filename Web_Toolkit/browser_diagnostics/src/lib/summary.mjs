// ./Web_Toolkit/browser_diagnostics/src/lib/summary.mjs
/**
 * Summary and Markdown rendering helpers for browser-diagnostics.
 */

function pushIssue(issues, condition, message) {
  if (condition) issues.push(message);
}

function hostTotals(host = {}) {
  const routes = Array.isArray(host.routes) ? host.routes : [];
  return {
    checkedRoutes: routes.length,
    consoleErrors: routes.reduce((total, route) => total + Number(route.console?.errorCount || 0), 0),
    pageErrors: routes.reduce((total, route) => total + Number(route.pageErrors?.length || 0), 0),
    failedRequests: routes.reduce((total, route) => total + Number(route.network?.blockingFailures?.length || 0), 0),
    ignoredFailures: routes.reduce((total, route) => total + Number(route.network?.ignoredFailures?.length || 0), 0),
    slowRoutes: routes.filter((route) => Number(route.metrics?.loadMs || 0) > Number(host.thresholds?.maxLoadMs || 5000)).length,
    poorLcpRoutes: routes.filter((route) => Number(route.metrics?.lcpMs || 0) > Number(host.thresholds?.maxLcpMs || 4000)).length,
    poorClsRoutes: routes.filter((route) => Number(route.metrics?.cls || 0) > Number(host.thresholds?.maxCls || 0.1)).length
  };
}

export function summarizeReport(report = {}) {
  const production = hostTotals(report.production || {});
  const development = report.development ? hostTotals(report.development) : null;
  const issues = [];

  pushIssue(issues, report.python?.ok === false, `Python browser runtime is not healthy: ${report.python?.error || 'unknown error'}`);
  pushIssue(issues, production.consoleErrors > 0, `Production browser console errors detected: ${production.consoleErrors}.`);
  pushIssue(issues, production.pageErrors > 0, `Production runtime page errors detected: ${production.pageErrors}.`);
  pushIssue(issues, production.failedRequests > 0, `Production blocking request failures detected: ${production.failedRequests}.`);
  pushIssue(issues, production.slowRoutes > 0, `Production routes exceeded browser load threshold: ${production.slowRoutes}.`);
  pushIssue(issues, production.poorLcpRoutes > 0, `Production routes exceeded LCP threshold: ${production.poorLcpRoutes}.`);
  pushIssue(issues, production.poorClsRoutes > 0, `Production routes exceeded CLS threshold: ${production.poorClsRoutes}.`);

  if (development) {
    pushIssue(issues, development.consoleErrors > 0, `Development browser console errors detected: ${development.consoleErrors}.`);
    pushIssue(issues, development.pageErrors > 0, `Development runtime page errors detected: ${development.pageErrors}.`);
    pushIssue(issues, development.failedRequests > 0, `Development blocking request failures detected: ${development.failedRequests}.`);
    pushIssue(issues, development.slowRoutes > 0, `Development routes exceeded browser load threshold: ${development.slowRoutes}.`);
  }

  if (report.lighthouse?.enabled && !report.lighthouse?.ok) {
    pushIssue(issues, true, `Lighthouse run did not complete cleanly: ${report.lighthouse?.error || 'unknown error'}`);
  }

  return {
    overall: issues.length > 0 ? 'warn' : 'pass',
    issues,
    metrics: {
      production,
      development
    }
  };
}

function routeLine(route = {}) {
  return `| ${route.path || '/'} | ${route.status || 0} | ${route.metrics?.loadMs || 0} | ${route.metrics?.fcpMs || 0} | ${route.metrics?.lcpMs || 0} | ${route.metrics?.cls ?? 0} | ${route.console?.errorCount || 0} | ${route.network?.blockingFailures?.length || 0} |`;
}

export function renderMarkdown(report = {}, summary = summarizeReport(report)) {
  const lines = [
    '# Browser Diagnostics',
    '',
    `- Checked at: ${report.checkedAt}`,
    `- Profile: ${report.profile}`,
    `- Project root: ${report.projectRoot}`,
    `- Overall: ${summary.overall.toUpperCase()}`,
    '',
    '## Issues',
    ''
  ];

  if (summary.issues.length === 0) {
    lines.push('- No issues detected.');
  } else {
    for (const issue of summary.issues) lines.push(`- ${issue}`);
  }

  for (const label of ['production', 'development']) {
    const host = report[label];
    if (!host) continue;
    lines.push('', `## ${label[0].toUpperCase()}${label.slice(1)} (${host.host})`, '', '| Route | Status | Load ms | FCP ms | LCP ms | CLS | Console errors | Blocking failures |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const route of host.routes || []) {
      lines.push(routeLine(route));
    }
  }

  if (report.lighthouse?.enabled) {
    lines.push('', '## Lighthouse', '', `- Enabled: true`, `- Status: ${report.lighthouse.ok ? 'ok' : 'warn'}`);
    if (report.lighthouse.preset) lines.push(`- Preset: ${report.lighthouse.preset}`);
    if (report.lighthouse.reportPath) lines.push(`- Report: ${report.lighthouse.reportPath}`);
    if (report.lighthouse.warning) lines.push(`- Warning: ${report.lighthouse.warning}`);
    if (report.lighthouse.error) lines.push(`- Error: ${report.lighthouse.error}`);
    if (report.lighthouse.categories) {
      for (const [key, value] of Object.entries(report.lighthouse.categories)) {
        lines.push(`- ${key}: ${value}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

