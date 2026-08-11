// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/pages-domain.mjs
/**
 * Cloudflare Pages custom domain management commands.
 *
 * Subcommands:
 *   list       — list all Pages projects in the account
 *   domains    — list custom domains attached to a project
 *   add-domain — attach a single custom domain to a project
 *   setup      — add configured domains + optionally clean stale DNS records
 *
 * Run via `cf-agent pages <subcommand> [--flags]`.
 *
 * Key inputs:
 *   .env: CF_PAGES_PROJECT_NAME, CF_PAGES_CUSTOM_DOMAINS, CF_ZONE_NAME,
 *         CLOUDFLARE_API_TOKEN, CF_OUTPUT_DIR
 *   CLI:  --project, --domain, --domains, --zone, --cleanup-dns, --apply
 *
 * Outputs: console summary + JSON report in CF_OUTPUT_DIR.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential } from '../lib/auth.mjs';
import {
    resolveZoneByName,
    listPagesProjects,
    listPagesCustomDomains,
    addPagesCustomDomain,
    deleteDnsRecord,
    safeCloudflareRequest
} from '../lib/cloudflare-api.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { prettyJson, toBool, utcStamp } from '../lib/format.mjs';

/* ── Squarespace fingerprint helpers ── */

const SQUARESPACE_IP_PREFIXES = ['198.185.159.', '198.49.23.'];

function isSquarespaceA(record) {
    if (record.type !== 'A') return false;
    const content = String(record.content || '');
    return SQUARESPACE_IP_PREFIXES.some((prefix) => content.startsWith(prefix));
}

function isSquarespaceCname(record) {
    if (record.type !== 'CNAME') return false;
    const content = String(record.content || '').toLowerCase();
    return content.endsWith('.squarespace.com');
}

function isSquarespaceRecord(record) {
    return isSquarespaceA(record) || isSquarespaceCname(record);
}

/* ── Shared helpers ── */

function parseDomainsCSV(value) {
    return String(value || '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
}

async function resolveAccountId(token, zoneName) {
    const zone = await resolveZoneByName(token, zoneName);
    const accountId = zone?.account?.id;
    if (!accountId) {
        throw new Error(`Could not extract account ID from zone "${zoneName}".`);
    }
    return { zone, accountId };
}

function resolveProjectName(flags, env) {
    const name = String(flags.project || envValue(env, 'CF_PAGES_PROJECT_NAME', '')).trim();
    if (!name) {
        throw new Error('Missing Pages project name. Set CF_PAGES_PROJECT_NAME or pass --project.');
    }
    return name;
}

/* ── Subcommands ── */

async function pagesList(flags) {
    const env = mergedEnv();
    const token = resolveCloudflareCredential(env, { requireApiToken: true }).token;
    const zoneName = String(flags.zone || envValue(env, 'CF_ZONE_NAME', '')).trim();
    if (!zoneName) throw new Error('Missing zone name. Set CF_ZONE_NAME or pass --zone.');

    const { accountId } = await resolveAccountId(token, zoneName);
    const projects = await listPagesProjects(token, accountId);

    console.log(`\nPages projects (account from zone: ${zoneName})`);
    if (projects.length === 0) {
        console.log('  (none)');
    } else {
        for (const project of projects) {
            const domains = project.domains || [];
            const domainList = domains.length > 0 ? domains.join(', ') : '(no custom domains)';
            console.log(`  • ${project.name} — ${project.subdomain || 'n/a'} — ${domainList}`);
        }
    }
    console.log(`  Total: ${projects.length}`);
    return 0;
}

async function pagesDomains(flags) {
    const env = mergedEnv();
    const token = resolveCloudflareCredential(env, { requireApiToken: true }).token;
    const zoneName = String(flags.zone || envValue(env, 'CF_ZONE_NAME', '')).trim();
    if (!zoneName) throw new Error('Missing zone name. Set CF_ZONE_NAME or pass --zone.');
    const projectName = resolveProjectName(flags, env);

    const { accountId } = await resolveAccountId(token, zoneName);
    const domains = await listPagesCustomDomains(token, accountId, projectName);

    console.log(`\nCustom domains for Pages project "${projectName}":`);
    if (domains.length === 0) {
        console.log('  (none)');
    } else {
        for (const entry of domains) {
            const status = entry.status || 'unknown';
            const certStatus = entry.certificate_authority || entry.ssl?.status || '';
            console.log(`  • ${entry.name || entry.domain || 'unknown'} — status: ${status}${certStatus ? ` — cert: ${certStatus}` : ''}`);
        }
    }
    return 0;
}

async function pagesAddDomain(flags) {
    const env = mergedEnv();
    const token = resolveCloudflareCredential(env, { requireApiToken: true }).token;
    const zoneName = String(flags.zone || envValue(env, 'CF_ZONE_NAME', '')).trim();
    if (!zoneName) throw new Error('Missing zone name. Set CF_ZONE_NAME or pass --zone.');
    const projectName = resolveProjectName(flags, env);
    const domain = String(flags.domain || '').trim().toLowerCase();
    if (!domain) throw new Error('Missing --domain flag.');

    const { accountId } = await resolveAccountId(token, zoneName);
    const apply = toBool(flags.apply, false);

    console.log(`\nAdding custom domain "${domain}" to project "${projectName}"...`);
    console.log(`- Mode: ${apply ? 'apply' : 'dry-run'}`);
    if (!apply) {
        console.log(`  [dry-run] Would add: ${domain}`);
        console.log('  Re-run with --apply to attach the domain.');
        return 0;
    }
    const result = await addPagesCustomDomain(token, accountId, projectName, domain);
    console.log(`  ✓ Added: ${result?.result?.name || domain}`);
    return 0;
}

async function pagesSetup(flags) {
    const env = mergedEnv();
    const token = resolveCloudflareCredential(env, { requireApiToken: true }).token;
    const zoneName = String(flags.zone || envValue(env, 'CF_ZONE_NAME', '')).trim();
    if (!zoneName) throw new Error('Missing zone name. Set CF_ZONE_NAME or pass --zone.');
    const projectName = resolveProjectName(flags, env);
    const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));
    const apply = toBool(flags.apply, false);
    const cleanupDns = Boolean(flags['cleanup-dns']);
    const requestedDomains = parseDomainsCSV(flags.domains || envValue(env, 'CF_PAGES_CUSTOM_DOMAINS', ''));

    if (requestedDomains.length === 0) {
        throw new Error('No domains to add. Set CF_PAGES_CUSTOM_DOMAINS or pass --domains.');
    }

    const { zone, accountId } = await resolveAccountId(token, zoneName);

    console.log(`\nPages domain setup${apply ? '' : ' [DRY RUN]'}`);
    console.log(`- Mode: ${apply ? 'apply' : 'dry-run'}`);
    console.log(`  Zone: ${zone.name} (${zone.id})`);
    console.log(`  Account: ${accountId}`);
    console.log(`  Project: ${projectName}`);
    console.log(`  Domains: ${requestedDomains.join(', ')}`);
    console.log(`  Cleanup DNS: ${cleanupDns ? 'yes' : 'no'}`);

    /* ── Step 1: Fetch existing custom domains ── */
    const existingDomains = await listPagesCustomDomains(token, accountId, projectName);
    const existingNames = new Set(existingDomains.map((entry) => String(entry.name || entry.domain || '').toLowerCase()));

    const toAdd = requestedDomains.filter((domain) => !existingNames.has(domain));
    const alreadyAttached = requestedDomains.filter((domain) => existingNames.has(domain));

    if (alreadyAttached.length > 0) {
        console.log(`\n  Already attached: ${alreadyAttached.join(', ')}`);
    }

    /* ── Step 2: Add missing domains ── */
    const addResults = [];
    for (const domain of toAdd) {
        if (!apply) {
            console.log(`  [dry-run] Would add: ${domain}`);
            addResults.push({ domain, action: 'dry-run' });
        } else {
            try {
                await addPagesCustomDomain(token, accountId, projectName, domain);
                console.log(`  ✓ Added: ${domain}`);
                addResults.push({ domain, action: 'added' });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.log(`  ✗ Failed to add ${domain}: ${message}`);
                addResults.push({ domain, action: 'failed', error: message });
            }
        }
    }

    /* ── Step 3: DNS cleanup (opt-in) ── */
    const dnsResults = [];
    if (cleanupDns) {
        const dnsResponse = await safeCloudflareRequest(token, `/zones/${zone.id}/dns_records?per_page=200`);
        const allRecords = Array.isArray(dnsResponse?.payload?.result) ? dnsResponse.payload.result : [];

        const staleRecords = allRecords.filter((record) => {
            const name = String(record.name || '').toLowerCase();
            const matchesDomain = requestedDomains.includes(name) || name === zoneName.toLowerCase();
            return matchesDomain && isSquarespaceRecord(record);
        });

        if (staleRecords.length === 0) {
            console.log('\n  No stale Squarespace DNS records found.');
        } else {
            console.log(`\n  Stale Squarespace DNS records: ${staleRecords.length}`);
            for (const record of staleRecords) {
                const label = `${record.type} ${record.name} → ${record.content}`;
                if (!apply) {
                    console.log(`  [dry-run] Would delete: ${label} (${record.id})`);
                    dnsResults.push({ id: record.id, label, action: 'dry-run' });
                } else {
                    try {
                        await deleteDnsRecord(token, zone.id, record.id);
                        console.log(`  ✓ Deleted: ${label}`);
                        dnsResults.push({ id: record.id, label, action: 'deleted' });
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        console.log(`  ✗ Failed to delete ${label}: ${message}`);
                        dnsResults.push({ id: record.id, label, action: 'failed', error: message });
                    }
                }
            }
        }
    }

    /* ── Report ── */
    const report = {
        checkedAt: new Date().toISOString(),
        apply,
        dryRun: !apply,
        zone: { id: zone.id, name: zone.name },
        project: projectName,
        requestedDomains,
        alreadyAttached,
        domainActions: addResults,
        dnsCleanup: cleanupDns ? dnsResults : 'skipped'
    };

    fs.mkdirSync(outputDir, { recursive: true });
    const outFile = path.join(outputDir, `pages-setup-${zone.name.replaceAll('.', '_')}-${utcStamp()}.json`);
    fs.writeFileSync(outFile, prettyJson(report), 'utf8');
    console.log(`\n  Report: ${outFile}`);

    const hasFailures = [...addResults, ...dnsResults].some((entry) => entry.action === 'failed');
    return hasFailures ? 2 : 0;
}

/* ── Router ── */

export async function runPagesDomain(subcommand, flags = {}) {
    switch (subcommand) {
        case 'list':
            return pagesList(flags);
        case 'domains':
            return pagesDomains(flags);
        case 'add-domain':
            return pagesAddDomain(flags);
        case 'setup':
            return pagesSetup(flags);
        default:
            console.error(`Unknown pages subcommand: ${subcommand || '(none)'}`);
            console.error('Available: list, domains, add-domain, setup');
            return 1;
    }
}

