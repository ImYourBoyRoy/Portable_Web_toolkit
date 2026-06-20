// ./Web_Toolkit/pagespeed_diagnostics/src/commands/agent-diff.mjs
/**
 * AI-agent-first diff for PageSpeed batch reports. It compares compact agent
 * reports, emits JSON only, and flags meaningful metric/score regressions.
 * Run via `node ./bin/pagespeed-diagnostics.mjs agent-diff`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function latestReports(outputDir, siteId) {
  if (!fs.existsSync(outputDir)) return [];
  return fs.readdirSync(outputDir)
    .filter((name) => name.startsWith(`pagespeed-agent-batch-${siteId}-`) && name.endsWith('.json'))
    .map((name) => path.join(outputDir, name))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
}

function checkKey(check) {
  return `${check.url}|${check.strategy}`;
}

function issueKey(issue) {
  return `${issue.url}|${issue.strategy}|${issue.code}`;
}

function thresholds(flags = {}) {
  return {
    minScoreDelta: toNumber(flags['min-score-delta'], 0.01),
    maxFcpRegressionMs: toNumber(flags['max-fcp-regression-ms'], 100),
    maxLcpRegressionMs: toNumber(flags['max-lcp-regression-ms'], 100),
    maxSpeedIndexRegressionMs: toNumber(flags['max-speed-index-regression-ms'], 250),
    maxTbtRegressionMs: toNumber(flags['max-tbt-regression-ms'], 50),
    maxClsRegression: toNumber(flags['max-cls-regression'], 0.01)
  };
}

function compareMetric({ before, after, metric, threshold, unit = 'ms' }) {
  const beforeValue = toNumber(before?.metrics?.[metric]);
  const afterValue = toNumber(after?.metrics?.[metric]);
  const delta = afterValue - beforeValue;
  if (delta <= threshold) return null;
  return {
    severity: 'fail',
    url: after.url,
    strategy: after.strategy,
    code: `regression-${metric}`,
    summary: `${metric} regressed by ${Math.round(delta)}${unit}.`,
    evidence: { before: beforeValue, after: afterValue, delta, threshold, unit }
  };
}

function compareScore({ before, after, category, threshold }) {
  const beforeValue = toNumber(before?.scores?.[category]);
  const afterValue = toNumber(after?.scores?.[category]);
  const delta = afterValue - beforeValue;
  if (delta >= -threshold) return null;
  return {
    severity: 'fail',
    url: after.url,
    strategy: after.strategy,
    code: `regression-score-${category}`,
    summary: `${category} score dropped from ${beforeValue} to ${afterValue}.`,
    evidence: { before: beforeValue, after: afterValue, delta, threshold }
  };
}

function compareReports(before, after, limits) {
  const beforeMap = new Map((before.checks || []).map((check) => [checkKey(check), check]));
  const regressions = [];
  const improvements = [];

  for (const afterCheck of after.checks || []) {
    const beforeCheck = beforeMap.get(checkKey(afterCheck));
    if (!beforeCheck) {
      regressions.push({
        severity: 'fail',
        url: afterCheck.url,
        strategy: afterCheck.strategy,
        code: 'new-check-without-baseline',
        summary: 'New PageSpeed check has no baseline report entry.',
        evidence: { key: checkKey(afterCheck) }
      });
      continue;
    }

    for (const category of ['performance', 'accessibility', 'bestPractices', 'seo']) {
      const scoreRegression = compareScore({ before: beforeCheck, after: afterCheck, category, threshold: limits.minScoreDelta });
      if (scoreRegression) regressions.push(scoreRegression);
      const beforeValue = toNumber(beforeCheck?.scores?.[category]);
      const afterValue = toNumber(afterCheck?.scores?.[category]);
      if (afterValue - beforeValue > limits.minScoreDelta) {
        improvements.push({
          url: afterCheck.url,
          strategy: afterCheck.strategy,
          code: `improved-score-${category}`,
          summary: `${category} score improved from ${beforeValue} to ${afterValue}.`,
          evidence: { before: beforeValue, after: afterValue, delta: afterValue - beforeValue }
        });
      }
    }

    const metricComparisons = [
      ['fcpMs', limits.maxFcpRegressionMs, 'ms'],
      ['lcpMs', limits.maxLcpRegressionMs, 'ms'],
      ['speedIndexMs', limits.maxSpeedIndexRegressionMs, 'ms'],
      ['tbtMs', limits.maxTbtRegressionMs, 'ms'],
      ['cls', limits.maxClsRegression, '']
    ];
    for (const [metric, threshold, unit] of metricComparisons) {
      const regression = compareMetric({ before: beforeCheck, after: afterCheck, metric, threshold, unit });
      if (regression) regressions.push(regression);
      const beforeValue = toNumber(beforeCheck?.metrics?.[metric]);
      const afterValue = toNumber(afterCheck?.metrics?.[metric]);
      const delta = afterValue - beforeValue;
      if (delta < -threshold) {
        improvements.push({
          url: afterCheck.url,
          strategy: afterCheck.strategy,
          code: `improved-${metric}`,
          summary: `${metric} improved by ${Math.round(Math.abs(delta))}${unit}.`,
          evidence: { before: beforeValue, after: afterValue, delta, threshold, unit }
        });
      }
    }
  }

  const beforeIssues = new Set((before.actionableIssues || []).map(issueKey));
  const afterIssues = new Set((after.actionableIssues || []).map(issueKey));
  const newIssues = (after.actionableIssues || []).filter((issue) => !beforeIssues.has(issueKey(issue)));
  const fixedIssues = (before.actionableIssues || []).filter((issue) => !afterIssues.has(issueKey(issue)));

  return { regressions: [...regressions, ...newIssues], improvements, fixedIssues };
}

export async function runAgentDiff(flags = {}) {
  const resolved = resolveProfile(flags);
  const projectRoot = resolveProjectRoot(flags, resolved);
  const outputDir = path.join(projectRoot, 'output');
  const reports = latestReports(outputDir, resolved.profile.siteId);
  const beforePath = flags.before ? path.resolve(String(flags.before)) : reports.at(-2);
  const afterPath = flags.after ? path.resolve(String(flags.after)) : reports.at(-1);

  if (!beforePath || !afterPath || beforePath === afterPath) {
    const report = {
      schemaVersion: 'agent-pagespeed-diff-v1',
      status: 'fail',
      checkedAt: new Date().toISOString(),
      profile: resolved.profile.siteId,
      error: 'Need two distinct pagespeed-agent-batch reports. Pass --before and --after or run agent-batch twice.',
      files: { before: beforePath || '', after: afterPath || '' }
    };
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return 2;
  }

  const before = readJson(beforePath);
  const after = readJson(afterPath);
  const limits = thresholds(flags);
  const compared = compareReports(before, after, limits);
  const status = compared.regressions.length > 0 ? 'fail' : 'pass';
  const diffPath = path.join(outputDir, `pagespeed-agent-diff-${resolved.profile.siteId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const report = {
    schemaVersion: 'agent-pagespeed-diff-v1',
    status,
    checkedAt: new Date().toISOString(),
    profile: resolved.profile.siteId,
    thresholds: limits,
    stats: {
      regressions: compared.regressions.length,
      improvements: compared.improvements.length,
      fixedIssues: compared.fixedIssues.length
    },
    regressions: compared.regressions,
    improvements: compared.improvements,
    fixedIssues: compared.fixedIssues,
    files: {
      before: beforePath,
      after: afterPath,
      diffReport: diffPath
    }
  };

  fs.writeFileSync(diffPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return status === 'pass' ? 0 : 2;
}
