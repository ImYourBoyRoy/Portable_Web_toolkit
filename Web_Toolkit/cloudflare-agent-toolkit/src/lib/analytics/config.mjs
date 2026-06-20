// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/analytics/config.mjs
/**
 * Config helpers for the Astro analytics scaffold flow.
 */

import path from 'node:path';
import { envValue } from '../env.mjs';
import { toBool } from '../format.mjs';

export function resolveProjectRoot(flags, env) {
  const explicit = String(flags['project-root'] || flags.project || envValue(env, 'ANALYTICS_PROJECT_ROOT', '')).trim();
  return explicit ? path.resolve(explicit) : path.resolve(process.cwd());
}

export function buildConfig(flags, env) {
  const ga4Id = String(
    flags['ga4-id'] ||
    flags.ga4 ||
    envValue(env, 'ANALYTICS_GA4_MEASUREMENT_ID', envValue(env, 'PUBLIC_GA4_MEASUREMENT_ID', ''))
  ).trim();
  const posthogKey = String(
    flags['posthog-key'] ||
    flags.posthog ||
    envValue(env, 'ANALYTICS_POSTHOG_API_KEY', envValue(env, 'PUBLIC_POSTHOG_API_KEY', ''))
  ).trim();
  const posthogHost = String(
    flags['posthog-host'] ||
    envValue(env, 'ANALYTICS_POSTHOG_API_HOST', envValue(env, 'PUBLIC_POSTHOG_API_HOST', 'https://us.i.posthog.com'))
  ).trim();

  return {
    analyticsEnabled: toBool(flags['analytics-enabled'] ?? envValue(env, 'ANALYTICS_ENABLED', 'true'), true),
    ga4Id,
    posthogKey,
    posthogHost: posthogHost || 'https://us.i.posthog.com',
    dryRun: toBool(flags['dry-run'], false),
    force: toBool(flags.force, false),
    writeEnv: toBool(flags['write-env'], true),
    patchLayout: toBool(flags['patch-layout'], true),
    patchEnvTypes: toBool(flags['patch-env-types'], true),
    patchMiddleware: toBool(flags['patch-middleware'], true)
  };
}

export function printOperation(operation) {
  const icon = {
    created: '+',
    updated: '~',
    unchanged: '=',
    skipped: '!',
    missing: '?'
  }[operation.status] || '-';
  const detail = operation.reason ? ` (${operation.reason})` : '';
  console.log(`  ${icon} ${operation.status.padEnd(9)} ${operation.filePath}${detail}`);
  if (Array.isArray(operation.notes)) {
    for (const note of operation.notes) {
      console.log(`      - ${note}`);
    }
  }
}

