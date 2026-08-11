// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/dns-fix.mjs
/**
 * Conservative DNS repair command for profile-driven Cloudflare sites.
 *
 * Updates low-risk proxied-state mismatches on existing records.
 * Missing records stay manual unless --create-missing is passed with --apply.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential } from '../lib/auth.mjs';
import { cloudflareRequest, resolveZoneByName, updateDnsRecord, listAllDnsRecords } from '../lib/cloudflare-api.mjs';
import { findDnsRecordByNameAndType } from '../lib/dns-match.mjs';
import { prettyJson, toBool, utcStamp } from '../lib/format.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';

export async function runDnsFix(flags = {}) {
  const site = loadSiteProfile(flags);
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const token = resolveCloudflareCredential(env, { requireApiToken: true }).token;
  if (!site.zoneName) throw new Error('Missing zone name in site profile or --zone flag.');
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));
  const apply = toBool(flags.apply, false);
  const createMissing = toBool(flags['create-missing'], false);

  const zone = await resolveZoneByName(token, site.zoneName);
  const records = await listAllDnsRecords(token, zone.id);
  const expectedRecords = Array.isArray(site.profile?.cloudflare?.dns?.expectedRecords)
    ? site.profile.cloudflare.dns.expectedRecords
    : Array.isArray(site.profile?.cloudflare?.dns?.records)
      ? site.profile.cloudflare.dns.records
      : [];

  const actions = [];
  for (const expected of expectedRecords) {
    const expectedType = String(expected.type || 'CNAME').toUpperCase();
    const match = findDnsRecordByNameAndType(records, expected);
    if (!match) {
      // Record missing — create it if content is specified
      if (!expected.content) {
        actions.push({ name: expected.name, action: 'manual-required', reason: 'record missing and no content in profile' });
        continue;
      }
      if (!apply || !createMissing) {
        actions.push({
          name: expected.name,
          action: apply && !createMissing ? 'manual-required' : 'dry-run-create',
          reason: apply && !createMissing ? 'record missing; re-run with --create-missing to create it' : 'record missing',
          type: expected.type,
          content: expected.content,
          proxied: expected.proxied ?? true
        });
        continue;
      }
      await cloudflareRequest(token, `/zones/${zone.id}/dns_records`, {
        method: 'POST',
        body: {
          type: expected.type || 'CNAME',
          name: expected.name,
          content: expected.content,
          proxied: expected.proxied ?? true,
          ttl: 1
        }
      });
      actions.push({ name: expected.name, action: 'created', type: expected.type, content: expected.content, proxied: expected.proxied ?? true });
      continue;
    }
    if (expected.proxied === undefined || match.proxied === expected.proxied) {
      actions.push({ name: expected.name, action: 'noop', proxied: match.proxied });
      continue;
    }
    if (!apply) {
      actions.push({ name: expected.name, action: 'dry-run-update-proxied', before: match.proxied, after: expected.proxied });
      continue;
    }
    await updateDnsRecord(token, zone.id, match.id, { proxied: expected.proxied });
    actions.push({ name: expected.name, action: 'updated-proxied', before: match.proxied, after: expected.proxied });
  }

  const report = {
    checkedAt: new Date().toISOString(),
    apply,
    createMissing,
    profile: site.profile.siteId,
    zone: { id: zone.id, name: zone.name },
    actions
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `dns-fix-${zone.name.replaceAll('.', '_')}-${utcStamp()}.json`);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');

  console.log('\nCloudflare DNS fix');
  console.log(`- Profile: ${site.profile.siteId}`);
  console.log(`- Zone: ${zone.name} (${zone.id})`);
  console.log(`- Mode: ${apply ? 'apply' : 'dry-run'}`);
  console.log(`- Actions: ${actions.length}`);
  console.log(`- Report: ${outputPath}`);

  return actions.some((entry) => entry.action === 'manual-required') ? 2 : 0;
}

