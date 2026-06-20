// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/scaffold-astro-analytics.mjs
/**
 * Scaffolds GA4 + PostHog analytics wiring for Astro projects.
 *
 * Run: `cf-agent scaffold astro-analytics --project-root <path> --ga4-id G-XXXX --posthog-key phc_xxx`
 * Inputs: CLI flags and optional env defaults (ANALYTICS_* keys in toolkit .env).
 * Outputs: Creates/updates analytics component files, middleware CSP, and env typing/config entries.
 * Side effects: Writes files in the target Astro project; no network calls are performed.
 * Notes: Idempotent by default; use `--dry-run` to preview and `--force` to overwrite generated components.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergedEnv } from '../lib/env.mjs';
import { buildConfig, printOperation, resolveProjectRoot } from '../lib/analytics/config.mjs';
import { upsertEnvFile, updateFileWithTransform, writeManagedFile } from '../lib/analytics/file-utils.mjs';
import { patchEnvTypingSource, patchLayoutSource, patchMiddlewareSource } from '../lib/analytics/patchers.mjs';
import { analyticsGa4Template, analyticsPosthogTemplate, middlewareTemplate } from '../lib/analytics/templates.mjs';

function buildOperations(projectRoot, flags, config) {
  const layoutPath = path.resolve(projectRoot, String(flags['layout-path'] || 'src/layouts/BaseLayout.astro'));
  const ga4Path = path.resolve(projectRoot, 'src/components/ga4.astro');
  const posthogPath = path.resolve(projectRoot, 'src/components/posthog.astro');
  const middlewarePath = path.resolve(projectRoot, 'src/middleware.ts');
  const envPath = path.resolve(projectRoot, '.env');
  const envExamplePath = path.resolve(projectRoot, '.env.example');
  const envTypesPath = path.resolve(projectRoot, 'src/env.d.ts');
  const operations = [];

  operations.push(writeManagedFile(ga4Path, analyticsGa4Template(), { dryRun: config.dryRun, force: config.force }));
  operations.push(writeManagedFile(posthogPath, analyticsPosthogTemplate(), { dryRun: config.dryRun, force: config.force }));

  if (config.patchMiddleware) {
    operations.push(
      fs.existsSync(middlewarePath)
        ? updateFileWithTransform(middlewarePath, patchMiddlewareSource, config.dryRun)
        : writeManagedFile(middlewarePath, middlewareTemplate(), { dryRun: config.dryRun, force: true })
    );
  } else {
    operations.push({ status: 'skipped', filePath: middlewarePath, reason: '--patch-middleware=false' });
  }

  operations.push(
    config.patchLayout
      ? updateFileWithTransform(layoutPath, patchLayoutSource, config.dryRun)
      : { status: 'skipped', filePath: layoutPath, reason: '--patch-layout=false' }
  );
  operations.push(
    config.patchEnvTypes
      ? updateFileWithTransform(envTypesPath, patchEnvTypingSource, config.dryRun)
      : { status: 'skipped', filePath: envTypesPath, reason: '--patch-env-types=false' }
  );

  if (!config.writeEnv) {
    operations.push({ status: 'skipped', filePath: envPath, reason: '--write-env=false' });
    operations.push({ status: 'skipped', filePath: envExamplePath, reason: '--write-env=false' });
    return operations;
  }

  const envUpdates = /** @type {Record<string, string>} */ ({
    PUBLIC_ANALYTICS_ENABLED: String(config.analyticsEnabled),
    PUBLIC_POSTHOG_API_HOST: config.posthogHost
  });
  if (config.ga4Id) envUpdates.PUBLIC_GA4_MEASUREMENT_ID = config.ga4Id;
  if (config.posthogKey) envUpdates.PUBLIC_POSTHOG_API_KEY = config.posthogKey;

  operations.push(upsertEnvFile(envPath, envUpdates, { dryRun: config.dryRun, createIfMissing: true }));
  operations.push(
    upsertEnvFile(
      envExamplePath,
      {
        PUBLIC_ANALYTICS_ENABLED: 'true',
        PUBLIC_GA4_MEASUREMENT_ID: '',
        PUBLIC_POSTHOG_API_KEY: '',
        PUBLIC_POSTHOG_API_HOST: config.posthogHost
      },
      { dryRun: config.dryRun, createIfMissing: true }
    )
  );

  return operations;
}

function hasBlockingIssues(operations) {
  const optionalMissingFiles = new Set(['layouts/BaseLayout.astro', 'src/env.d.ts']);
  return operations.some((operation) => {
    const relative = operation.filePath.replace(/\\/g, '/');
    if (operation.status === 'missing' && !optionalMissingFiles.has(relative.split('/').slice(-2).join('/')) && !optionalMissingFiles.has(relative.split('/').slice(-3).join('/'))) {
      return true;
    }
    return Array.isArray(operation.notes) && operation.notes.some((note) => String(note).toLowerCase().includes('unable'));
  });
}

export async function runAstroAnalyticsScaffold(flags = {}) {
  const env = mergedEnv();
  const projectRoot = resolveProjectRoot(flags, env);
  const config = buildConfig(flags, env);
  const operations = buildOperations(projectRoot, flags, config);

  console.log('\ncf-agent scaffold astro-analytics');
  console.log(`- Target project: ${projectRoot}`);
  console.log(`- Dry run: ${config.dryRun ? 'yes' : 'no'}`);
  console.log('- File operations:');
  operations.forEach(printOperation);

  if (!config.ga4Id) {
    console.log('- Note: GA4 measurement id not provided; PUBLIC_GA4_MEASUREMENT_ID remains blank.');
  }
  if (!config.posthogKey) {
    console.log('- Note: PostHog API key not provided; PUBLIC_POSTHOG_API_KEY remains blank.');
  }
  console.log(config.dryRun ? '- No files were changed (dry run).' : '- Scaffold complete. Restart your dev server to pick up env changes.');

  return hasBlockingIssues(operations) ? 2 : 0;
}

