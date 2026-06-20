// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/dns-audit.mjs
/**
 * DNS audit command for profile-driven Cloudflare sites.
 *
 * Compares expected profile records against live zone records and reports
 * nameserver, record, and proxy mismatches without mutating anything.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential, summarizeAuthSource } from '../lib/auth.mjs';
import { resolveZoneByName, safeCloudflareRequest } from '../lib/cloudflare-api.mjs';
import { prettyJson, utcStamp } from '../lib/format.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';

function summarizeRecord(record) {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    content: record.content,
    proxied: record.proxied,
    ttl: record.ttl
  };
}

export async function runDnsAudit(flags = {}) {
  const site = loadSiteProfile(flags);
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const auth = resolveCloudflareCredential(env, { allowWranglerOauth: true });
  const token = auth.token;
  if (!site.zoneName) throw new Error('Missing zone name in site profile or --zone flag.');
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));

  const zone = await resolveZoneByName(token, site.zoneName);
  const dnsResult = await safeCloudflareRequest(token, `/zones/${zone.id}/dns_records?per_page=200`);
  const records = Array.isArray(dnsResult?.payload?.result) ? dnsResult.payload.result : [];
  const expectedRecords = Array.isArray(site.profile?.cloudflare?.dns?.expectedRecords)
    ? site.profile.cloudflare.dns.expectedRecords
    : Array.isArray(site.profile?.cloudflare?.dns?.records)
      ? site.profile.cloudflare.dns.records
      : [];

  const checks = expectedRecords.map((expected) => {
    const match = records.find((record) => String(record.name || '').toLowerCase() === String(expected.name || '').toLowerCase());
    return {
      expected,
      found: match ? summarizeRecord(match) : null,
      ok: Boolean(match) && (expected.type ? match.type === expected.type : true) && (expected.proxied === undefined ? true : match.proxied === expected.proxied)
    };
  });

  const report = {
    checkedAt: new Date().toISOString(),
    profile: site.profile.siteId,
    auth: {
      source: auth.source,
      label: summarizeAuthSource(auth)
    },
    zone: {
      id: zone.id,
      name: zone.name,
      status: zone.status,
      nameServers: zone.name_servers || [],
      originalNameServers: zone.original_name_servers || []
    },
    expectedRecords,
    checks,
    ...(dnsResult.ok
      ? {
          liveInterestingRecords: records
            .filter((record) => [...site.productionHosts, ...site.developmentHosts].includes(String(record.name || '').toLowerCase()))
            .map(summarizeRecord)
        }
      : {
          dnsError: dnsResult.error,
          liveInterestingRecords: []
        })
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `dns-audit-${zone.name.replaceAll('.', '_')}-${utcStamp()}.json`);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');

  const failures = checks.filter((entry) => !entry.ok).length;
  console.log('\nCloudflare DNS audit');
  console.log(`- Profile: ${site.profile.siteId}`);
  console.log(`- Auth: ${summarizeAuthSource(auth)}`);
  console.log(`- Zone: ${zone.name} (${zone.id})`);
  console.log(`- Expected records checked: ${checks.length}`);
  console.log(`- Mismatches: ${failures}`);
  if (!dnsResult.ok) {
    console.log(`- DNS API access: unavailable (${dnsResult.error})`);
  }
  console.log(`- Report: ${outputPath}`);

  return failures > 0 || !dnsResult.ok ? 2 : 0;
}

