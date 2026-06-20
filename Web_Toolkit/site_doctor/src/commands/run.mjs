// ./Web_Toolkit/site_doctor/src/commands/run.mjs
/**
 * Runs a unified local + Cloudflare diagnostic pass and writes a combined report.
 */

import fs from 'node:fs';
import path from 'node:path';
import { runNodeScript } from '../lib/exec.mjs';
import { loadSiteProfile, resolveProjectRoot } from '../lib/paths.mjs';
import { extractReportPath, parseJsonSafe, readJsonIfExists } from '../lib/reports.mjs';
import { renderMarkdown, summarizeRun, summarizeStep } from '../lib/summary.mjs';

function boolFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function outputPaths(projectRoot, siteId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(projectRoot, 'output');
  return {
    outputDir,
    jsonPath: path.join(outputDir, `site-doctor-${siteId}-${stamp}.json`),
    mdPath: path.join(outputDir, `site-doctor-${siteId}-${stamp}.md`)
  };
}

function commandResult(id, command, result, projectRoot) {
  const reportPath = extractReportPath(`${result.stdout}\n${result.stderr}`, projectRoot);
  const report = reportPath ? readJsonIfExists(reportPath) : parseJsonSafe(result.stdout, null);
  const step = {
    id,
    command,
    exitCode: result.status,
    reportPath,
    report,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
  step.summary = summarizeStep(step);
  return step;
}

function buildCommands(projectRoot, profilePath, flags = {}) {
  const skipCloudflare = boolFlag(flags['skip-cloudflare'], false);
  const commands = [
    {
      id: 'agent-env',
      enabled: !boolFlag(flags['skip-agent-env'], false),
      script: 'Setup_agent_environment/bin/agent-env-setup.mjs',
      args: ['doctor', '--workspace', projectRoot, '--json']
    },
    {
      id: 'astro-env',
      enabled: true,
      script: 'Setup_astro_environment/bin/astro-env-setup.mjs',
      args: ['doctor', '--project-root', projectRoot, '--site-profile', profilePath, '--json']
    },
    {
      id: 'preview-smoke',
      enabled: !boolFlag(flags['skip-preview-smoke'], false),
      script: 'Setup_astro_environment/bin/astro-env-setup.mjs',
      args: ['preview-smoke', '--project-root', projectRoot, '--site-profile', profilePath, '--timeout-ms', String(flags['preview-timeout-ms'] || 180000)]
    },
    {
      id: 'quality-smoke',
      enabled: !boolFlag(flags['skip-quality-smoke'], false),
      script: 'site_quality_smoke/bin/site-quality-smoke.mjs',
      args: ['run', '--project-root', projectRoot, '--site-profile', profilePath]
    },
    {
      id: 'browser-diagnostics',
      enabled: !boolFlag(flags['skip-browser-diagnostics'], false),
      script: 'browser_diagnostics/bin/browser-diagnostics.mjs',
      args: [
        'run',
        '--project-root',
        projectRoot,
        '--site-profile',
        profilePath,
        ...(boolFlag(flags['browser-lighthouse'], false) ? ['--lighthouse'] : []),
        ...(flags['browser-lighthouse-preset'] ? ['--lighthouse-preset', String(flags['browser-lighthouse-preset'])] : []),
        ...(boolFlag(flags['browser-screenshots'], false) ? ['--screenshots'] : [])
      ]
    },
    {
      id: 'brand-doctor',
      enabled: !boolFlag(flags['skip-brand-doctor'], false),
      script: 'brand_doctor/bin/brand-doctor.mjs',
      args: ['audit', '--project-root', projectRoot, '--site-profile', profilePath]
    },
    {
      id: 'integration-doctor',
      enabled: !boolFlag(flags['skip-integration-doctor'], false),
      script: 'integration_doctor/bin/integration-doctor.mjs',
      args: ['run', '--project-root', projectRoot, '--site-profile', profilePath]
    },
    {
      id: 'pagespeed',
      enabled: boolFlag(flags.pagespeed, false),
      script: 'pagespeed_diagnostics/bin/pagespeed-diagnostics.mjs',
      args: [
        'run',
        '--project-root',
        projectRoot,
        '--site-profile',
        profilePath,
        ...(flags['pagespeed-strategy'] ? ['--strategy', String(flags['pagespeed-strategy'])] : [])
      ]
    },
    {
      id: 'permissions-audit',
      enabled: !skipCloudflare,
      script: 'cloudflare-agent-toolkit/bin/cf-agent.mjs',
      args: ['permissions', 'audit', '--site-profile', profilePath]
    },
    {
      id: 'site-audit',
      enabled: !skipCloudflare,
      script: 'cloudflare-agent-toolkit/bin/cf-agent.mjs',
      args: ['site', 'audit', '--site-profile', profilePath]
    },
    {
      id: 'dns-audit',
      enabled: !skipCloudflare,
      script: 'cloudflare-agent-toolkit/bin/cf-agent.mjs',
      args: ['dns', 'audit', '--site-profile', profilePath]
    },
    {
      id: 'dns-public',
      enabled: !skipCloudflare,
      script: 'cloudflare-agent-toolkit/bin/cf-agent.mjs',
      args: ['dns', 'public', '--site-profile', profilePath]
    },
    {
      id: 'rules-audit',
      enabled: !skipCloudflare,
      script: 'cloudflare-agent-toolkit/bin/cf-agent.mjs',
      args: ['rules', 'audit', '--site-profile', profilePath]
    },
    {
      id: 'email-audit',
      enabled: !skipCloudflare && !boolFlag(flags['skip-email'], false),
      script: 'cloudflare-agent-toolkit/bin/cf-agent.mjs',
      args: ['email', 'audit', '--site-profile', profilePath]
    },
    {
      id: 'workers-verify',
      enabled: !skipCloudflare,
      script: 'cloudflare-agent-toolkit/bin/cf-agent.mjs',
      args: ['workers', 'verify', '--site-profile', profilePath]
    },
    {
      id: 'site-harden',
      enabled: !skipCloudflare,
      script: 'cloudflare-agent-toolkit/bin/cf-agent.mjs',
      args: ['site', 'harden', '--site-profile', profilePath]
    }
  ];
  return commands.filter((entry) => entry.enabled);
}

export async function runSiteDoctor(flags = {}) {
  const { path: profilePath, profile } = loadSiteProfile(flags);
  const projectRoot = resolveProjectRoot({ ...flags, 'site-profile': profilePath });
  const paths = outputPaths(projectRoot, profile.siteId);
  fs.mkdirSync(paths.outputDir, { recursive: true });

  const steps = [];
  for (const entry of buildCommands(projectRoot, profilePath, flags)) {
    const result = runNodeScript(entry.script, entry.args, { cwd: projectRoot });
    steps.push(commandResult(entry.id, `node ${entry.script} ${entry.args.join(' ')}`, result, projectRoot));
  }

  const report = {
    checkedAt: new Date().toISOString(),
    profile: profile.siteId,
    projectRoot,
    siteProfile: profilePath,
    steps
  };
  const summary = summarizeRun(report);
  const finalReport = { ...report, summary };
  fs.writeFileSync(paths.jsonPath, `${JSON.stringify(finalReport, null, 2)}\n`, 'utf8');
  fs.writeFileSync(paths.mdPath, renderMarkdown(finalReport, summary), 'utf8');

  console.log('\nSite doctor');
  console.log(`- Profile: ${profile.siteId}`);
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Overall: ${summary.overall.toUpperCase()}`);
  console.log(`- Pass/Warn/Fail: ${summary.passCount}/${summary.warnCount}/${summary.failCount}`);
  console.log(`- Report: ${paths.jsonPath}`);
  console.log(`- Markdown: ${paths.mdPath}`);

  return summary.overall === 'fail' ? 1 : summary.overall === 'warn' ? 2 : 0;
}

