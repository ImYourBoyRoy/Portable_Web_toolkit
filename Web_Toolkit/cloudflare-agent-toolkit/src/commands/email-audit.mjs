// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/email-audit.mjs
/**
 * Audit email-related DNS posture for a zone.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential, summarizeAuthSource } from '../lib/auth.mjs';
import { cloudflareRequest, resolveZoneByName } from '../lib/cloudflare-api.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { prettyJson, utcStamp } from '../lib/format.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';
import { auditEmailDns } from '../lib/audit/email-dns.mjs';

export async function runEmailAudit(flags = {}) {
  const site = loadSiteProfile(flags);
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const auth = resolveCloudflareCredential(env, { allowWranglerOauth: true });
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));
  const zone = await resolveZoneByName(auth.token, site.zoneName);
  const dnsPayload = await cloudflareRequest(auth.token, `/zones/${zone.id}/dns_records?per_page=200`);
  const records = Array.isArray(dnsPayload?.result) ? dnsPayload.result : [];
  const email = auditEmailDns(records, zone.name);
  const report = {
    checkedAt: new Date().toISOString(),
    profile: site.profile.siteId,
    auth: { source: auth.source, label: summarizeAuthSource(auth) },
    zone: { id: zone.id, name: zone.name },
    email
  };
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `email-audit-${zone.name.replaceAll('.', '_')}-${utcStamp()}.json`);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');
  console.log('\nCloudflare email DNS audit');
  console.log(`- Profile: ${site.profile.siteId}`);
  console.log(`- Mail provider guess: ${email.mailProviderGuess}`);
  console.log(`- MX/SPF/DMARC/DKIM: ${email.hasMx ? 'yes' : 'no'}/${email.hasSpf ? 'yes' : 'no'}/${email.hasDmarc ? 'yes' : 'no'}/${email.dkimCandidateCount}`);
  console.log(`- Warnings: ${email.warnings.length}`);
  console.log(`- Report: ${outputPath}`);
  return email.warnings.length > 0 ? 2 : 0;
}

