// ./Web_Toolkit/site_doctor/src/lib/summary.mjs
/**
 * Summary and diff helpers for the portable site doctor tool.
 */

function statusFromExitCode(exitCode) {
  if (exitCode === 0) return 'pass';
  if (exitCode === 2) return 'warn';
  return 'fail';
}

function normalizeResolverValues(view = []) {
  return view.map((entry) => JSON.stringify((entry.values || []).slice().sort())).filter(Boolean);
}

export function summarizeStep(step = {}) {
  const summary = {
    id: step.id,
    status: statusFromExitCode(step.exitCode),
    metrics: {},
    issues: []
  };
  const report = step.report || {};

  if (step.id === 'agent-env') {
    const requiredMissing = Object.entries(report.tools || {})
      .filter(([key, value]) => ['git', 'node', 'npm', 'npx', 'python', 'pip'].includes(key) && !value?.ok)
      .map(([key]) => key);
    summary.metrics.requiredToolsMissing = requiredMissing.length;
    if (requiredMissing.length > 0) summary.issues.push(`Missing required host tools: ${requiredMissing.join(', ')}`);
  }

  if (step.id === 'astro-env') {
    const missing = [];
    if (!report.packageJsonExists) missing.push('package.json');
    if (!report.nodeModulesExists) missing.push('node_modules');
    if (!report.astroConfigExists) missing.push('astro config');
    if (!report.hasBuildScript) missing.push('build script');
    summary.metrics.projectChecksMissing = missing.length;
    if (missing.length > 0) summary.issues.push(`Project setup gaps: ${missing.join(', ')}`);
  }

  if (step.id === 'preview-smoke') {
    summary.metrics.previewOk = Boolean(report.probe?.ok);
    if (!report.probe?.ok) summary.issues.push(`Local preview probe failed: ${report.probe?.error || 'no response'}`);
  }

  if (step.id === 'quality-smoke') {
    const detailIssues = Array.isArray(report.summary?.issues) ? report.summary.issues : [];
    const issueCount = detailIssues.length;
    summary.metrics.qualityIssues = issueCount;
    summary.metrics.prodRootMs = Number(report.production?.root?.durationMs || 0);
    summary.metrics.devRootMs = Number(report.development?.root?.durationMs || 0);
    if (issueCount > 0) summary.issues.push(...detailIssues);
  }

  if (step.id === 'browser-diagnostics') {
    const detailIssues = Array.isArray(report.summary?.issues) ? report.summary.issues : [];
    const issueCount = detailIssues.length;
    summary.metrics.browserIssues = issueCount;
    summary.metrics.browserProdConsoleErrors = Number(report.summary?.metrics?.production?.consoleErrors || 0);
    summary.metrics.browserProdFailures = Number(report.summary?.metrics?.production?.failedRequests || 0);
    if (issueCount > 0) summary.issues.push(...detailIssues);
  }

  if (step.id === 'wcag-auditor') {
    const gate = report.gate || {};
    summary.metrics.wcagExitCode = Number(step.exitCode ?? gate.exitCode ?? 0);
    summary.metrics.wcagFailed = Number(gate.counts?.failed ?? report.summary?.failed ?? 0);
    if (step.exitCode === 1) summary.issues.push('WCAG auditor reported blocking accessibility findings.');
    if (step.exitCode === 2) summary.issues.push('WCAG auditor failed to execute (config, dependency, adapter, or empty surface).');
    if (step.exitCode === 3) summary.issues.push('WCAG auditor left required evidence untested or inconclusive.');
    if (step.stderr) summary.issues.push(step.stderr.split('\n').filter(Boolean).slice(0, 3).join(' | '));
  }

  if (step.id === 'brand-doctor') {
    const detailIssues = Array.isArray(report.summary?.issues) ? report.summary.issues : [];
    const issueCount = detailIssues.length;
    summary.metrics.brandIssues = issueCount;
    if (issueCount > 0) summary.issues.push(...detailIssues);
  }

  if (step.id === 'integration-doctor') {
    const detailIssues = Array.isArray(report.summary?.issues) ? report.summary.issues : [];
    const issueCount = detailIssues.length;
    summary.metrics.integrationIssues = issueCount;
    summary.metrics.requiredIntegrations = Number(report.summary?.metrics?.requiredIntegrations || 0);
    if (issueCount > 0) summary.issues.push(...detailIssues);
  }

  if (step.id === 'pagespeed') {
    const failed = Array.isArray(report.results) ? report.results.filter((entry) => !entry.ok).length : 0;
    summary.metrics.pagespeedFailures = failed;
    const mobile = Array.isArray(report.results) ? report.results.find((entry) => entry.strategy === 'mobile') : null;
    if (mobile?.ok) summary.metrics.pagespeedMobilePerformance = mobile.performance;
    if (failed > 0) summary.issues.push(`PageSpeed API failed for ${failed} requested strateg${failed === 1 ? 'y' : 'ies'}.`);
  }

  if (step.id === 'permissions-audit') {
    const missing = Number(report.checks?.missingPermissionCount || 0);
    summary.metrics.missingPermissions = missing;
    if (missing > 0) summary.issues.push(`Cloudflare token is missing ${missing} required permissions.`);
  }

  if (step.id === 'site-audit') {
    const missingRoutes = Array.isArray(report.workers?.checks) ? report.workers.checks.filter((entry) => !entry.ok).length : 0;
    const devBlocked = Boolean(report.crawlPolicy?.developmentBlocked);
    summary.metrics.missingRoutes = missingRoutes;
    summary.metrics.devCrawlBlocked = devBlocked;
    if (missingRoutes > 0) summary.issues.push(`Missing worker routes: ${missingRoutes}`);
    if (!devBlocked) summary.issues.push('Development host is crawlable but should be blocked.');
  }

  if (step.id === 'dns-audit') {
    const mismatches = Array.isArray(report.checks) ? report.checks.filter((entry) => !entry.ok).length : 0;
    summary.metrics.dnsMismatches = mismatches;
    if (mismatches > 0) summary.issues.push(`DNS mismatches detected: ${mismatches}`);
  }

  if (step.id === 'dns-public') {
    const disagreements = Array.isArray(report.checks)
      ? report.checks.filter((entry) => Array.isArray(entry.resolverViews) && entry.resolverViews.some((view) => new Set(normalizeResolverValues(view.resolvers)).size > 1)).length
      : 0;
    summary.metrics.resolverDisagreements = disagreements;
    if (disagreements > 0) summary.issues.push(`Resolver disagreement detected for ${disagreements} host/type groups.`);
  }

  if (step.id === 'rules-audit') {
    summary.metrics.presentRulePhases = Array.isArray(report.summary?.present) ? report.summary.present.length : 0;
    if ((report.summary?.present || []).length === 0) {
      summary.issues.push('No Cloudflare rule phases are currently populated.');
    }
  }

  if (step.id === 'email-audit') {
    const warnings = Array.isArray(report.email?.warnings) ? report.email.warnings.length : 0;
    summary.metrics.emailWarnings = warnings;
    if (warnings > 0) summary.issues.push(`Email DNS warnings: ${warnings}`);
  }

  if (step.id === 'workers-verify') {
    const missing = Array.isArray(report.checks) ? report.checks.filter((entry) => !entry.ok).length : 0;
    summary.metrics.missingWorkerRoutes = missing;
    if (missing > 0) summary.issues.push(`Worker route verification failed for ${missing} routes.`);
  }

  if (step.id === 'site-harden') {
    const changed = Array.isArray(report.settings) ? report.settings.filter((entry) => entry.changed).length : 0;
    const smokeFailures = Array.isArray(report.smoke) ? report.smoke.filter((entry) => !entry.ok).length : 0;
    summary.metrics.hardeningChangesNeeded = changed;
    summary.metrics.hardeningSmokeFailures = smokeFailures;
    if (changed > 0) summary.issues.push(`Hardening drift detected: ${changed} settings would change.`);
    if (smokeFailures > 0) summary.issues.push(`Hardening smoke failures: ${smokeFailures}`);
  }

  if (summary.issues.length > 0 && summary.status === 'pass') {
    summary.status = 'warn';
  }
  return summary;
}

export function summarizeRun(report = {}) {
  const steps = (report.steps || []).map((step) => ({ ...step, summary: step.summary || summarizeStep(step) }));
  const passCount = steps.filter((step) => step.summary.status === 'pass').length;
  const warnCount = steps.filter((step) => step.summary.status === 'warn').length;
  const failCount = steps.filter((step) => step.summary.status === 'fail').length;
  const issues = steps.flatMap((step) => step.summary.issues.map((issue) => ({ step: step.id, issue })));
  const overall = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';
  return { overall, passCount, warnCount, failCount, issues, steps };
}

export function renderMarkdown(report = {}, summary = summarizeRun(report)) {
  const lines = [
    '# Site Doctor Report',
    '',
    `- Checked at: ${report.checkedAt}`,
    `- Profile: ${report.profile}`,
    `- Project root: ${report.projectRoot}`,
    `- Overall: ${summary.overall.toUpperCase()}`,
    '',
    '## Step Summary',
    '',
    '| Step | Status | Key metrics |',
    '| --- | --- | --- |',
    ...summary.steps.map((step) => `| ${step.id} | ${step.summary.status} | ${Object.entries(step.summary.metrics).map(([key, value]) => `${key}=${value}`).join(', ') || 'n/a'} |`),
    '',
    '## Issues',
    ''
  ];
  if (summary.issues.length === 0) {
    lines.push('- No issues detected.');
  } else {
    for (const issue of summary.issues) {
      lines.push(`- **${issue.step}**: ${issue.issue}`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function diffDoctorReports(current = {}, previous = {}) {
  const currentSummary = summarizeRun(current);
  const previousSummary = summarizeRun(previous);
  const currentByStep = new Map(currentSummary.steps.map((step) => [step.id, step.summary]));
  const previousByStep = new Map(previousSummary.steps.map((step) => [step.id, step.summary]));
  const changedSteps = [];

  for (const stepId of new Set([...currentByStep.keys(), ...previousByStep.keys()])) {
    const currentStep = currentByStep.get(stepId);
    const previousStep = previousByStep.get(stepId);
    if (JSON.stringify(currentStep) !== JSON.stringify(previousStep)) {
      changedSteps.push({ stepId, before: previousStep || null, after: currentStep || null });
    }
  }

  return {
    current: { checkedAt: current.checkedAt, overall: currentSummary.overall },
    previous: { checkedAt: previous.checkedAt, overall: previousSummary.overall },
    changedSteps
  };
}


