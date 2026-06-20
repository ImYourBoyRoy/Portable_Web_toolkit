// ./Web_Toolkit/integration_doctor/src/commands/run.mjs
/**
 * Runs env/live integration diagnostics for analytics, forms, email, and auth.
 */

import fs from 'node:fs';
import path from 'node:path';
import { collectEnvState, inspectExpectedKeys } from '../lib/env.mjs';
import { fetchText } from '../lib/http.mjs';
import { resolveIntegrationDefinition, markerHits } from '../lib/markers.mjs';
import { resolveProfile, resolveProjectRoot } from '../lib/paths.mjs';
import { latestEmailAudit, outputPaths } from '../lib/reports.mjs';
import { renderMarkdown, summarizeReport } from '../lib/summary.mjs';

function readPackageScripts(projectRoot) {
  const packagePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packagePath)) return {};
  return JSON.parse(fs.readFileSync(packagePath, 'utf8')).scripts || {};
}

async function evaluateLive(pathname, host, markers, cache) {
  if (!pathname || !markers.length) {
    return { checked: false, ok: true, path: pathname || '', status: 0, markerHits: [] };
  }
  const key = pathname;
  if (!cache.has(key)) {
    cache.set(key, fetchText(`https://${host}${pathname}`));
  }
  const response = await cache.get(key);
  const hits = markerHits(response.body, markers);
  return {
    checked: true,
    path: pathname,
    status: response.status,
    ok: response.ok && hits.length > 0,
    markerHits: hits,
    error: response.error || ''
  };
}

function integrationEntries(profile = {}) {
  const groups = profile.diagnostics?.integrations || {};
  return Object.entries(groups).flatMap(([category, items]) =>
    Object.entries(items || {}).map(([name, spec]) => resolveIntegrationDefinition(category, name, spec || {}))
  );
}

export async function runIntegrationDoctor(flags = {}) {
  const resolved = resolveProfile(flags);
  const { profile } = resolved;
  const projectRoot = resolveProjectRoot(flags, resolved);
  const env = collectEnvState(projectRoot);
  const emailAudit = latestEmailAudit(projectRoot);
  const scripts = readPackageScripts(projectRoot);
  const liveCache = new Map();
  const liveHost = profile.hosts.production[0];

  const integrations = [];
  for (const definition of integrationEntries(profile)) {
    const envStatus = inspectExpectedKeys(definition.envKeys, env);
    const liveStatus = await evaluateLive(definition.path, liveHost, definition.markers, liveCache);
    const emailStatus = definition.category === 'email'
      ? {
          checked: Boolean(emailAudit),
          warningsCount: Array.isArray(emailAudit?.email?.warnings) ? emailAudit.email.warnings.length : 0,
          warnings: emailAudit?.email?.warnings || [],
          provider: emailAudit?.email?.provider || definition.provider
        }
      : { checked: false, warningsCount: 0, warnings: [] };
    integrations.push({
      ...definition,
      env: envStatus,
      live: liveStatus,
      emailAudit: emailStatus
    });
  }

  const report = {
    checkedAt: new Date().toISOString(),
    profile: profile.siteId,
    projectRoot,
    env: {
      envExampleExists: env.envExampleExists,
      envExists: env.envExists,
      portableEnvExists: env.portableEnvExists,
      envExampleKeys: env.envExampleKeys,
      projectEnvKeys: env.projectEnvKeys,
      portableEnvKeys: env.portableEnvKeys,
      cloudflareTokenSource: env.cloudflareTokenSource
    },
    packageScripts: Object.keys(scripts).sort(),
    integrations
  };
  const summary = summarizeReport(report);
  const paths = outputPaths(projectRoot, profile.siteId);
  fs.mkdirSync(paths.outputDir, { recursive: true });
  fs.writeFileSync(paths.jsonPath, `${JSON.stringify({ ...report, summary }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(paths.mdPath, renderMarkdown(report, summary), 'utf8');

  console.log('\nIntegration doctor');
  console.log(`- Profile: ${profile.siteId}`);
  console.log(`- Overall: ${summary.overall.toUpperCase()}`);
  console.log(`- Report: ${paths.jsonPath}`);
  console.log(`- Markdown: ${paths.mdPath}`);
  return summary.overall === 'warn' ? 2 : 0;
}

