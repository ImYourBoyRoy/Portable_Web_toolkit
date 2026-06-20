// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/workers-verify.mjs
/**
 * Worker route verification for profile-driven Cloudflare sites.
 *
 * Confirms expected prod/dev route patterns exist on the target zone.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential, summarizeAuthSource } from '../lib/auth.mjs';
import { cloudflareRequest, resolveZoneByName } from '../lib/cloudflare-api.mjs';
import { prettyJson, utcStamp } from '../lib/format.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';

export async function runWorkersVerify(flags = {}) {
  const site = loadSiteProfile(flags);
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const auth = resolveCloudflareCredential(env, { allowWranglerOauth: true });
  const token = auth.token;
  if (!site.zoneName) throw new Error('Missing zone name in site profile or --zone flag.');
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));

  const zone = await resolveZoneByName(token, site.zoneName);
  const routesPayload = await cloudflareRequest(token, `/zones/${zone.id}/workers/routes`);
  const routes = Array.isArray(routesPayload?.result) ? routesPayload.result : [];
  const expected = [
    ...(site.profile?.cloudflare?.routes?.production || []),
    ...(site.profile?.cloudflare?.routes?.development || [])
  ];
  const checks = expected.map((pattern) => {
    const match = routes.find((route) => route.pattern === pattern);
    return {
      pattern,
      ok: Boolean(match),
      script: match?.script || null,
      enabled: match?.enabled ?? null
    };
  });

  const report = {
    checkedAt: new Date().toISOString(),
    profile: site.profile.siteId,
    auth: {
      source: auth.source,
      label: summarizeAuthSource(auth)
    },
    zone: { id: zone.id, name: zone.name },
    expectedRoutes: expected,
    checks,
    liveRoutes: routes.map((route) => ({
      id: route.id,
      pattern: route.pattern,
      script: route.script,
      enabled: route.enabled
    }))
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `workers-verify-${zone.name.replaceAll('.', '_')}-${utcStamp()}.json`);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');

  const failures = checks.filter((entry) => !entry.ok).length;
  console.log('\nCloudflare workers verify');
  console.log(`- Profile: ${site.profile.siteId}`);
  console.log(`- Auth: ${summarizeAuthSource(auth)}`);
  console.log(`- Zone: ${zone.name} (${zone.id})`);
  console.log(`- Expected routes: ${expected.length}`);
  console.log(`- Missing routes: ${failures}`);
  console.log(`- Report: ${outputPath}`);

  return failures > 0 ? 2 : 0;
}

