// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/token-audit.mjs
/**
 * Cloudflare API token permissions audit command.
 *
 * Verifies token policy scopes/resources and reports missing permissions
 * required for common automation and zone security workflows.
 */

import fs from 'node:fs';
import path from 'node:path';
import { REQUIRED_PERMISSION_NAMES } from '../config/defaults.mjs';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential } from '../lib/auth.mjs';
import { tokenDetails, verifyToken } from '../lib/cloudflare-api.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { prettyJson, utcStamp } from '../lib/format.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';

function policyPermissionNames(policies) {
  const names = new Set();
  for (const policy of policies || []) {
    for (const group of policy?.permission_groups || []) {
      const name = String(group?.name || '').trim();
      if (name) names.add(name);
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function policyResources(policies) {
  const keys = new Set();
  for (const policy of policies || []) {
    for (const key of Object.keys(policy?.resources || {})) {
      keys.add(key);
    }
  }
  return [...keys].sort((left, right) => left.localeCompare(right));
}

export async function runTokenAudit(flags = {}) {
  const site = flags.profile || flags['site-profile'] ? loadSiteProfile(flags) : null;
  const env = site ? mergedEnv([path.join(site.projectRoot, '.env')]) : mergedEnv();
  const token = resolveCloudflareCredential(env, { requireApiToken: true }).token;
  const expectedZone = String(flags.zone || envValue(env, 'CF_EXPECTED_ZONE', envValue(env, 'CF_ZONE_NAME', ''))).trim();
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));

  const verify = await verifyToken(token);
  const tokenId = String(verify?.result?.id || '').trim();
  if (!tokenId) throw new Error('Token verification succeeded but token id was not returned.');

  const detailsPayload = await tokenDetails(token, tokenId);
  const tokenResult = detailsPayload?.result || {};
  const policies = Array.isArray(tokenResult?.policies) ? tokenResult.policies : [];
  const grantedPermissions = policyPermissionNames(policies);
  const missingPermissions = REQUIRED_PERMISSION_NAMES.filter((name) => !grantedPermissions.includes(name));
  const resources = policyResources(policies);

  const report = {
    checkedAt: new Date().toISOString(),
    expectedZone: expectedZone || null,
    token: {
      id: tokenId,
      name: tokenResult?.name || null,
      status: tokenResult?.status || null,
      issuedOn: tokenResult?.issued_on || null,
      modifiedOn: tokenResult?.modified_on || null,
      lastUsedOn: tokenResult?.last_used_on || null
    },
    checks: {
      hasZoneResource: resources.some((key) => key.includes('.zone.')),
      hasAccountResource: resources.some((key) => key.includes('.account.')),
      requiredPermissionCount: REQUIRED_PERMISSION_NAMES.length,
      missingPermissionCount: missingPermissions.length
    },
    permissions: {
      required: REQUIRED_PERMISSION_NAMES,
      granted: grantedPermissions,
      missing: missingPermissions
    },
    resources
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `token-audit-${utcStamp()}.json`);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');

  console.log('\nCloudflare token audit');
  console.log(`- Token: ${report.token.name || '(unnamed)'} (${report.token.id})`);
  console.log(`- Status: ${report.token.status || 'unknown'}`);
  console.log(`- Missing required permissions: ${report.checks.missingPermissionCount}`);
  console.log(`- Report: ${outputPath}`);

  return report.checks.missingPermissionCount > 0 ? 2 : 0;
}

