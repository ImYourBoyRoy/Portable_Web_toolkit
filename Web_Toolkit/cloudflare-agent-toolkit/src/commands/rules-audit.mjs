// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/rules-audit.mjs
/**
 * Audit redirect/cache/header/origin/WAF rule coverage for a site profile.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential, summarizeAuthSource } from '../lib/auth.mjs';
import { cloudflareRequest, resolveZoneByName } from '../lib/cloudflare-api.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { prettyJson, utcStamp } from '../lib/format.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';
import { summarizeRulesets } from '../lib/audit/rules-summary.mjs';

export async function runRulesAudit(flags = {}) {
  const site = loadSiteProfile(flags);
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const auth = resolveCloudflareCredential(env, { allowWranglerOauth: true });
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));
  const zone = await resolveZoneByName(auth.token, site.zoneName);
  const [rulesetsPayload, pageRulesPayload] = await Promise.all([
    cloudflareRequest(auth.token, `/zones/${zone.id}/rulesets?per_page=50`),
    cloudflareRequest(auth.token, `/zones/${zone.id}/pagerules`)
  ]);
  const rulesets = Array.isArray(rulesetsPayload?.result) ? rulesetsPayload.result : [];
  const pageRules = Array.isArray(pageRulesPayload?.result) ? pageRulesPayload.result : [];
  const summary = summarizeRulesets(rulesets, pageRules);
  const report = {
    checkedAt: new Date().toISOString(),
    profile: site.profile.siteId,
    auth: { source: auth.source, label: summarizeAuthSource(auth) },
    zone: { id: zone.id, name: zone.name },
    summary
  };
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `rules-audit-${zone.name.replaceAll('.', '_')}-${utcStamp()}.json`);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');
  console.log('\nCloudflare rules audit');
  console.log(`- Profile: ${site.profile.siteId}`);
  console.log(`- Auth: ${summarizeAuthSource(auth)}`);
  console.log(`- Zone: ${zone.name} (${zone.id})`);
  console.log(`- Rulesets: ${summary.totalRulesets}`);
  console.log(`- Legacy page rules: ${summary.legacyPageRules}`);
  console.log(`- Present rule phases: ${summary.present.map((entry) => `${entry.label}=${entry.count}`).join(', ') || 'none'}`);
  console.log(`- Report: ${outputPath}`);
  return 0;
}

