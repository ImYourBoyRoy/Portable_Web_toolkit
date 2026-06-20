// ./Web_Toolkit/browser_diagnostics/src/commands/run.mjs
/**
 * Runs live browser diagnostics via Python Playwright and optional Lighthouse.
 */

import fs from 'node:fs';
import path from 'node:path';
import { runLighthouse, runPythonDiagnostics } from '../lib/exec.mjs';
import { outputPaths, resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';
import { renderMarkdown, summarizeReport } from '../lib/summary.mjs';

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function browserConfig(profile, paths, flags = {}) {
  const browser = profile.diagnostics?.browserDiagnostics || {};
  const includeDevelopment = toBool(flags['include-development'], true);
  return {
    profile: profile.siteId,
    projectRoot: path.resolve(String(flags['project-root'] || profile.projectRoot || process.cwd())),
    productionHost: profile.hosts?.production?.[0] || "",
    developmentHost: includeDevelopment ? (profile.hosts?.development?.[0] || "") : '',
    routes: Array.isArray(browser.routes) && browser.routes.length > 0
      ? browser.routes
      : Array.isArray(profile.diagnostics?.qualitySmoke?.routes) && profile.diagnostics.qualitySmoke.routes.length > 0
        ? profile.diagnostics.qualitySmoke.routes
        : ['/'],
    timeoutMs: Number(flags['timeout-ms'] || browser.timeoutMs || 20000),
    settleMs: Number(flags['settle-ms'] || browser.settleMs || 1200),
    maxLoadMs: Number(browser.maxLoadMs || 5000),
    maxFcpMs: Number(browser.maxFcpMs || 2500),
    maxLcpMs: Number(browser.maxLcpMs || 4000),
    maxCls: Number(browser.maxCls || 0.1),
    headed: toBool(flags.headed, false),
    screenshots: toBool(flags.screenshots, false),
    screenshotsDir: paths.screenshotsDir,
    jsonOut: paths.pythonJsonPath
  };
}

function parseJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function parseLighthouseReport(filePath) {
  const report = parseJsonFile(filePath, null);
  if (!report) return { ok: false, enabled: true, reportPath: filePath, error: 'No Lighthouse JSON report was produced.' };
  const categories = Object.fromEntries(
    Object.entries(report.categories || {}).map(([key, value]) => [key, Number(value?.score ?? 0)])
  );
  return {
    ok: true,
    enabled: true,
    reportPath: filePath,
    categories
  };
}

export async function runBrowserDiagnostics(flags = {}) {
  const resolved = resolveProfile(flags);
  const { profile } = resolved;
  const projectRoot = resolveProjectRoot(flags, resolved);
  const paths = outputPaths(projectRoot, profile.siteId);
  fs.mkdirSync(paths.outputDir, { recursive: true });

  const config = browserConfig(profile, paths, flags);
  fs.writeFileSync(paths.tempConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  const pythonResult = runPythonDiagnostics(paths.tempConfigPath, projectRoot);
  const pythonReport = parseJsonFile(paths.pythonJsonPath, null);
  const baseReport = pythonReport || {
    checkedAt: new Date().toISOString(),
    profile: profile.siteId,
    projectRoot,
    production: null,
    development: null,
    python: {
      ok: false,
      stdout: pythonResult.stdout.trim(),
      stderr: pythonResult.stderr.trim(),
      error: 'Python browser diagnostics did not produce a JSON report.'
    }
  };

  let lighthouse = { enabled: false, ok: true };
  if (toBool(flags.lighthouse, false)) {
    const preset = ['desktop', 'mobile'].includes(String(flags['lighthouse-preset'] || '').toLowerCase())
      ? String(flags['lighthouse-preset']).toLowerCase()
      : 'mobile';
    const tempDir = path.join(paths.outputDir, `lighthouse-temp-${paths.stamp}`);
    const result = runLighthouse(`https://${config.productionHost}`, paths.lighthouseJsonPath, tempDir, projectRoot, {}, preset);
    const parsedReport = parseJsonFile(paths.lighthouseJsonPath, null);
    lighthouse = result.status === 0 || parsedReport
      ? {
          ...parseLighthouseReport(paths.lighthouseJsonPath),
          preset,
          warning: result.status === 0 ? '' : result.stderr.trim() || result.stdout.trim() || ''
        }
      : {
          enabled: true,
          ok: false,
          preset,
          reportPath: paths.lighthouseJsonPath,
          error: result.stderr.trim() || result.stdout.trim() || 'Lighthouse failed.'
        };
  }

  const report = {
    ...baseReport,
    checkedAt: new Date().toISOString(),
    projectRoot,
    siteProfile: resolved.profilePath,
    lighthouse
  };
  const summary = summarizeReport(report);
  fs.writeFileSync(paths.jsonPath, `${JSON.stringify({ ...report, summary }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(paths.mdPath, renderMarkdown(report, summary), 'utf8');
  fs.rmSync(paths.tempConfigPath, { force: true });

  console.log('\nBrowser diagnostics');
  console.log(`- Profile: ${profile.siteId}`);
  console.log(`- Overall: ${summary.overall.toUpperCase()}`);
  console.log(`- Report: ${paths.jsonPath}`);
  console.log(`- Markdown: ${paths.mdPath}`);
  if (report.lighthouse?.enabled) {
    console.log(`- Lighthouse: ${report.lighthouse.ok ? 'ok' : 'warn'}`);
    if (report.lighthouse.preset) console.log(`- Lighthouse preset: ${report.lighthouse.preset}`);
    if (report.lighthouse.reportPath) console.log(`- Lighthouse report: ${report.lighthouse.reportPath}`);
  }

  if (!pythonReport) return 1;
  return summary.overall === 'warn' ? 2 : 0;
}

