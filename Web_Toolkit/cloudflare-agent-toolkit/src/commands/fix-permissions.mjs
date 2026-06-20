// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/fix-permissions.mjs
/**
 * Programmatic token permission self-repair command.
 *
 * Uses the token's own API Tokens Write permission to fetch available
 * Cloudflare permission groups, map required permissions by name, and
 * update the token's policies so all required permissions are granted.
 *
 * Usage: cf-agent auth fix-permissions [--zone <name>] [--dry-run]
 * Inputs: zone name (flag or CF_ZONE_NAME env), optional --dry-run flag.
 * Outputs: Console summary of added permissions, JSON report in CF_OUTPUT_DIR.
 * Notes: Requires the token to already have API Tokens Write. This is a
 *        write operation that modifies the token's own permission set.
 */

import fs from 'node:fs';
import path from 'node:path';
import { REQUIRED_PERMISSION_NAMES } from '../config/defaults.mjs';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential } from '../lib/auth.mjs';
import { cloudflareRequest, verifyToken, tokenDetails } from '../lib/cloudflare-api.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { prettyJson, utcStamp, toBool } from '../lib/format.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';

/* ------------------------------------------------------------------ */
/*  Permission group discovery                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch all available permission groups from Cloudflare.
 * GET /user/tokens/permission_groups
 */
async function fetchPermissionGroups(token) {
    const payload = await cloudflareRequest(token, '/user/tokens/permission_groups');
    return Array.isArray(payload?.result) ? payload.result : [];
}

/**
 * Map our REQUIRED_PERMISSION_NAMES to Cloudflare permission group objects.
 * Returns { matched: [{name, id, scopes}], unmatched: [name] }.
 */
function mapRequiredPermissions(allGroups, requiredNames) {
    const matched = [];
    const unmatched = [];

    for (const name of requiredNames) {
        // Cloudflare permission group names may differ slightly:
        // Our "Zone Read" -> Cloudflare "Zone Read" or "Zone.Zone.Read"
        // Match by checking if the permission group name matches.
        // Strategy: exact match first, then fuzzy suffix match.
        const normalizedName = name.toLowerCase().trim();

        let match = allGroups.find(
            (g) => (g.name || '').toLowerCase().trim() === normalizedName
        );

        if (!match) {
            // Try suffix match: "Zone Read" might be listed as "Zone.Read" or similar
            // Also try matching with "#read" / "#write" / "#edit" scopes
            const parts = normalizedName.split(/\s+/);
            const resource = parts.slice(0, -1).join(' ');
            const action = parts[parts.length - 1];
            // Map "Write" -> "Edit" since Cloudflare uses "Edit" in some contexts
            const altAction = action === 'write' ? 'edit' : action;

            match = allGroups.find((g) => {
                const gName = (g.name || '').toLowerCase().trim();
                return (
                    gName === `${resource} ${altAction}` ||
                    gName.includes(resource) && (gName.includes(action) || gName.includes(altAction))
                );
            });
        }

        if (match) {
            matched.push({ name, id: match.id, cloudflare_name: match.name, scopes: match.scopes || [] });
        } else {
            unmatched.push(name);
        }
    }

    return { matched, unmatched };
}

/* ------------------------------------------------------------------ */
/*  Token update                                                       */
/* ------------------------------------------------------------------ */

/**
 * Build the updated policies array, keeping existing policies and adding
 * missing permission groups under the correct resource scope.
 */
function buildUpdatedPolicies(existingPolicies, matchedPermissions, resources) {
    // Group new permissions by scope (zone vs account)
    const zonePerms = [];
    const accountPerms = [];

    for (const perm of matchedPermissions) {
        // Check scopes to determine if zone or account level
        const scopes = Array.isArray(perm.scopes) ? perm.scopes : [];
        const isZoneScope = scopes.some((s) => String(s).includes('zone')) ||
            perm.name.toLowerCase().includes('zone') ||
            perm.name.toLowerCase().includes('dns') ||
            perm.name.toLowerCase().includes('ssl') ||
            perm.name.toLowerCase().includes('waf') ||
            perm.name.toLowerCase().includes('analytics');
        const isAccountScope = scopes.some((s) => String(s).includes('account')) ||
            perm.name.toLowerCase().includes('workers') ||
            perm.name.toLowerCase().includes('kv') ||
            perm.name.toLowerCase().includes('d1') ||
            perm.name.toLowerCase().includes('pages');

        if (isAccountScope && !isZoneScope) {
            accountPerms.push({ id: perm.id });
        } else {
            zonePerms.push({ id: perm.id });
        }
    }

    // Check if existing policies already cover zone/account resources
    const existingZonePolicy = existingPolicies.find((p) =>
        Object.keys(p.resources || {}).some((k) => k.includes('.zone.'))
    );
    const existingAccountPolicy = existingPolicies.find((p) =>
        Object.keys(p.resources || {}).some((k) => k.includes('.account.')) && !Object.keys(p.resources || {}).some((k) => k.includes('.zone.'))
    );

    const policies = [];

    // Preserve existing policies but merge in new permission groups
    for (const policy of existingPolicies) {
        const hasZone = Object.keys(policy.resources || {}).some((k) => k.includes('.zone.'));
        const hasAccountOnly = Object.keys(policy.resources || {}).some((k) => k.includes('.account.')) && !hasZone;

        const existingGroupIds = new Set((policy.permission_groups || []).map((g) => g.id));
        const mergedGroups = [...(policy.permission_groups || [])];

        if (hasZone && zonePerms.length > 0) {
            for (const perm of zonePerms) {
                if (!existingGroupIds.has(perm.id)) {
                    mergedGroups.push(perm);
                }
            }
        }

        if (hasAccountOnly && accountPerms.length > 0) {
            for (const perm of accountPerms) {
                if (!existingGroupIds.has(perm.id)) {
                    mergedGroups.push(perm);
                }
            }
        }

        policies.push({
            ...policy,
            permission_groups: mergedGroups
        });
    }

    // If no zone policy exists but we have zone perms, create one
    if (!existingZonePolicy && zonePerms.length > 0) {
        const zoneResource = resources.find((r) => r.includes('.zone.')) || 'com.cloudflare.api.account.zone.*';
        const accountResource = resources.find((r) => r.includes('.account.') && !r.includes('.zone.')) || 'com.cloudflare.api.account.*';
        policies.push({
            effect: 'allow',
            resources: { [zoneResource]: '*', [accountResource]: '*' },
            permission_groups: zonePerms
        });
    }

    // If no account-only policy exists but we have account perms, add them to existing
    if (!existingAccountPolicy && accountPerms.length > 0) {
        const accountResource = resources.find((r) => r.includes('.account.') && !r.includes('.zone.')) || 'com.cloudflare.api.account.*';
        // Check if we already added them via zone policy merge
        const allGroupIds = new Set(policies.flatMap((p) => (p.permission_groups || []).map((g) => g.id)));
        const missing = accountPerms.filter((p) => !allGroupIds.has(p.id));
        if (missing.length > 0) {
            // Add to the first policy with account resources, or create new
            const target = policies.find((p) => Object.keys(p.resources || {}).some((k) => k.includes('.account.')));
            if (target) {
                target.permission_groups = [...(target.permission_groups || []), ...missing];
            } else {
                policies.push({
                    effect: 'allow',
                    resources: { [accountResource]: '*' },
                    permission_groups: missing
                });
            }
        }
    }

    return policies;
}

/* ------------------------------------------------------------------ */
/*  Main runner                                                        */
/* ------------------------------------------------------------------ */

export async function runFixPermissions(flags = {}) {
    const site = flags.profile || flags['site-profile'] ? loadSiteProfile(flags) : null;
    const env = site ? mergedEnv([path.join(site.projectRoot, '.env')]) : mergedEnv();
  const token = resolveCloudflareCredential(env, { requireApiToken: true }).token;
    const zoneName = String(flags.zone || envValue(env, 'CF_ZONE_NAME', '')).trim();
    const dryRun = toBool(flags['dry-run'], false);
    const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));

    console.log('\nCloudflare token permission repair');
    console.log(`- Zone: ${zoneName || '(not set)'}`);
    console.log(`- Mode: ${dryRun ? 'dry-run' : 'apply'}\n`);

    // Step 1: Verify token and get details
    const verify = await verifyToken(token);
    const tokenId = String(verify?.result?.id || '').trim();
    if (!tokenId) throw new Error('Token verification succeeded but token id was not returned.');

    const detailsPayload = await tokenDetails(token, tokenId);
    const tokenResult = detailsPayload?.result || {};
    const currentPolicies = Array.isArray(tokenResult?.policies) ? tokenResult.policies : [];
    const resources = [];
    for (const policy of currentPolicies) {
        for (const key of Object.keys(policy?.resources || {})) {
            if (!resources.includes(key)) resources.push(key);
        }
    }

    // Check the token has API Tokens Write
    const grantedNames = new Set();
    for (const policy of currentPolicies) {
        for (const group of policy?.permission_groups || []) {
            grantedNames.add(String(group?.name || '').trim());
        }
    }
    if (!grantedNames.has('API Tokens Write') && !grantedNames.has('Account API Tokens Write')) {
        throw new Error('Token does not have API Tokens Write permission. Cannot self-repair.');
    }

    // Step 2: Fetch all permission groups
    console.log('  Fetching available permission groups...');
    const allGroups = await fetchPermissionGroups(token);
    console.log(`  Found ${allGroups.length} permission groups`);

    // Step 3: Map required permissions
    const { matched, unmatched } = mapRequiredPermissions(allGroups, REQUIRED_PERMISSION_NAMES);

    // Identify which are already granted
    const alreadyGrantedIds = new Set();
    for (const policy of currentPolicies) {
        for (const group of policy?.permission_groups || []) {
            alreadyGrantedIds.add(group.id);
        }
    }
    const toAdd = matched.filter((p) => !alreadyGrantedIds.has(p.id));
    const alreadyPresent = matched.filter((p) => alreadyGrantedIds.has(p.id));

    console.log(`\n  Permission mapping results:`);
    console.log(`    Already granted: ${alreadyPresent.length}`);
    for (const p of alreadyPresent) {
        console.log(`      ✅ ${p.name} -> ${p.cloudflare_name}`);
    }
    console.log(`    To add: ${toAdd.length}`);
    for (const p of toAdd) {
        console.log(`      ➕ ${p.name} -> ${p.cloudflare_name} (${p.id})`);
    }
    if (unmatched.length > 0) {
        console.log(`    ⚠ Unmatched: ${unmatched.length}`);
        for (const name of unmatched) {
            console.log(`      ❌ ${name} (no matching permission group found)`);
        }
    }

    // Step 4: Build and apply updated policies
    if (toAdd.length === 0) {
        console.log('\n  All required permissions already granted. Nothing to do.');
        return 0;
    }

    const updatedPolicies = buildUpdatedPolicies(currentPolicies, toAdd, resources);

    const report = {
        checkedAt: new Date().toISOString(),
        tokenId,
        tokenName: tokenResult?.name || null,
        dryRun,
        permissionsAdded: toAdd.map((p) => ({ name: p.name, cloudflare_name: p.cloudflare_name, id: p.id })),
        permissionsAlreadyGranted: alreadyPresent.map((p) => p.name),
        unmatchedPermissions: unmatched,
        updatedPolicies
    };

    if (dryRun) {
        console.log('\n  Dry-run: would update token with the above permissions.');
        console.log('  Re-run without --dry-run to apply.');
    } else {
        console.log('\n  Updating token...');
        await cloudflareRequest(token, `/user/tokens/${tokenId}`, {
            method: 'PUT',
            body: {
                name: tokenResult?.name || 'cf-agent token',
                policies: updatedPolicies
            }
        });
        console.log('  ✅ Token updated successfully.');
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `fix-permissions-${utcStamp()}.json`);
    fs.writeFileSync(outputPath, prettyJson(report), 'utf8');
    console.log(`- Report: ${outputPath}`);

    return 0;
}

