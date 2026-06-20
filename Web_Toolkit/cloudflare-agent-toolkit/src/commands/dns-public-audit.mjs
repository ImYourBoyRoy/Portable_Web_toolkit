// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/dns-public-audit.mjs
/**
 * Compare profile hosts against public and local DNS resolver views.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential, summarizeAuthSource } from '../lib/auth.mjs';
import { cloudflareRequest, resolveZoneByName } from '../lib/cloudflare-api.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { prettyJson, utcStamp } from '../lib/format.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';
import { resolveDnsAcrossResolvers } from '../lib/dns/public-dns.mjs';

function relevantValues(records, host) {
  return records
    .filter((entry) => String(entry.name || '').toLowerCase() === host.toLowerCase() && ['A', 'AAAA', 'CNAME'].includes(String(entry.type || '').toUpperCase()))
    .map((entry) => ({ type: entry.type, content: String(entry.content || '') }))
    .sort((left, right) => `${left.type}:${left.content}`.localeCompare(`${right.type}:${right.content}`));
}

export async function runDnsPublicAudit(flags = {}) {
  const site = loadSiteProfile(flags);
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const auth = resolveCloudflareCredential(env, { allowWranglerOauth: true });
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));
  const zone = await resolveZoneByName(auth.token, site.zoneName);
  const dnsPayload = await cloudflareRequest(auth.token, `/zones/${zone.id}/dns_records?per_page=200`);
  const records = Array.isArray(dnsPayload?.result) ? dnsPayload.result : [];
  const hosts = [...site.productionHosts, ...site.developmentHosts];
  const checks = [];
  for (const host of hosts) {
    checks.push({
      host,
      cloudflareControlPlane: relevantValues(records, host),
      resolverViews: await resolveDnsAcrossResolvers(host)
    });
  }
  const report = {
    checkedAt: new Date().toISOString(),
    profile: site.profile.siteId,
    auth: { source: auth.source, label: summarizeAuthSource(auth) },
    zone: { id: zone.id, name: zone.name },
    checks
  };
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `dns-public-audit-${zone.name.replaceAll('.', '_')}-${utcStamp()}.json`);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');
  console.log('\nCloudflare public DNS audit');
  console.log(`- Profile: ${site.profile.siteId}`);
  console.log(`- Hosts checked: ${checks.length}`);
  console.log(`- Report: ${outputPath}`);
  return 0;
}

