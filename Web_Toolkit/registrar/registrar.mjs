#!/usr/bin/env node
// ./Web_Toolkit/registrar/registrar.mjs
/**
 * CLI entry point for the portable Registrar toolkit.
 *
 * Manages domain nameserver delegation at the registrar level.
 * Currently supports Porkbun as the registrar provider.
 *
 * Run: node registrar/registrar.mjs <command> [--flags]
 *
 * Commands:
 *   ping                                — verify Porkbun API credentials
 *   domains                             — list all domains + API access status
 *   status     --site-profile <path>    — full migration pipeline status (AI brain command)
 *   ns audit   --site-profile <path>    — compare registrar NS vs Cloudflare-assigned NS
 *   ns update  --site-profile <path>    — update registrar NS to Cloudflare (dry-run default)
 *   zone ensure --site-profile <path>   — add domain as zone in Cloudflare if missing
 *   redirect   --site-profile <path>    — create redirect rules for alias domains
 *
 * Key env vars: PORKBUN_API_KEY, PORKBUN_SECRET_KEY, CLOUDFLARE_API_TOKEN
 *
 * Outputs: console summary + JSON report in .runtime/reports/registrar/
 */

import fs from 'node:fs';
import path from 'node:path';

// Shared helpers
import { resolvePortableRoot, resolveRuntimePath } from '../shared/lib/context.mjs';
import { loadSiteProfileContext } from '../shared/lib/context.mjs';
import { mergeEnvFiles } from '../shared/lib/env.mjs';

// Cloudflare API (reuse existing toolkit)
import { resolveZoneByName, safeCloudflareRequest, cloudflareRequest } from '../cloudflare-agent-toolkit/src/lib/cloudflare-api.mjs';
import { resolveCloudflareCredential } from '../cloudflare-agent-toolkit/src/lib/auth.mjs';

// Porkbun API
import {
  porkbunPing,
  porkbunListDomains,
  porkbunGetNs,
  porkbunUpdateNs,
  porkbunCheckDomainAccess
} from './porkbun-api.mjs';

// Pipeline status checker
import { checkMigrationPipeline } from './status.mjs';

// Redirect rule creator
import { runRedirect } from './redirect.mjs';

// ── Constants ──

const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 1);
const REPORT_DIR = resolveRuntimePath(PORTABLE_ROOT, 'reports', 'registrar');

function utcStamp() {
  return new Date().toISOString().replaceAll(':', '-');
}

function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

// ── CLI parser (reuse pattern from cf-agent) ──

function parseCliArgs(argv) {
  const command = [];
  const flags = {};
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token === '--') break;
    if (token.startsWith('--')) {
      const trimmed = token.slice(2);
      const eq = trimmed.indexOf('=');
      if (eq >= 0) {
        flags[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
      } else {
        const next = argv[index + 1];
        if (next && !next.startsWith('-')) {
          flags[trimmed] = next;
          index += 1;
        } else {
          flags[trimmed] = true;
        }
      }
    } else if (token.startsWith('-')) {
      for (const char of token.slice(1)) flags[char] = true;
    } else if (command.length < 2) {
      command.push(token);
    }
    index += 1;
  }
  return { command, flags };
}

// ── Environment resolution ──

function resolveEnv(flags) {
  const projectRoot = String(flags['project-root'] || '').trim();
  const envPaths = [path.join(PORTABLE_ROOT, '.env')];
  if (projectRoot) envPaths.push(path.join(path.resolve(projectRoot), '.env'));

  // Also try the parent project root (two levels up from portable)
  const parentEnvPath = path.join(PORTABLE_ROOT, '..', '.env');
  if (fs.existsSync(parentEnvPath)) envPaths.push(parentEnvPath);

  return mergeEnvFiles(...envPaths);
}

function requirePorkbunCreds(env) {
  const apiKey = String(env.PORKBUN_API_KEY || '').trim();
  const secretKey = String(env.PORKBUN_SECRET_KEY || '').trim();
  if (!apiKey) throw new Error('Missing PORKBUN_API_KEY. Set it in the project root .env or shell env.');
  if (!secretKey) throw new Error('Missing PORKBUN_SECRET_KEY. Set it in the project root .env or shell env.');
  return { apiKey, secretKey };
}

function writeReport(filename, data) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const outputPath = path.join(REPORT_DIR, filename);
  fs.writeFileSync(outputPath, prettyJson(data), 'utf8');
  return outputPath;
}

// ── Commands ──

async function cmdPing(flags) {
  const env = resolveEnv(flags);
  const { apiKey, secretKey } = requirePorkbunCreds(env);

  console.log('\nPorkbun credential check');
  console.log('  Testing API credentials...');

  const result = await porkbunPing(apiKey, secretKey);

  console.log(`  ✓ Credentials valid`);
  console.log(`  ✓ Caller IP: ${result.ip}`);
  console.log(`  ✓ API key prefix: ${apiKey.slice(0, 12)}...`);

  const reportPath = writeReport(`ping-${utcStamp()}.json`, {
    checkedAt: new Date().toISOString(),
    valid: true,
    callerIp: result.ip,
    apiKeyPrefix: apiKey.slice(0, 12)
  });
  console.log(`  Report: ${reportPath}`);
  return 0;
}

async function cmdDomains(flags) {
  const env = resolveEnv(flags);
  const { apiKey, secretKey } = requirePorkbunCreds(env);

  console.log('\nPorkbun domain inventory');
  console.log('  Fetching domains...');

  const domains = await porkbunListDomains(apiKey, secretKey);

  if (domains.length === 0) {
    console.log('  (no domains found)');
    return 0;
  }

  console.log(`  Found ${domains.length} domain(s):\n`);

  // Check API access for each domain
  const results = [];
  for (const d of domains) {
    const name = d.domain || 'unknown';
    const access = await porkbunCheckDomainAccess(apiKey, secretKey, name);

    const statusIcon = access.hasAccess ? '✓' : '✗';
    const nsLabel = access.hasAccess ? `NS: ${access.nameservers.join(', ')}` : '';
    const autoRenew = d.autoRenew === 1 ? 'auto-renew' : 'manual-renew';
    const expires = d.expireDate || 'unknown';

    console.log(`  ${statusIcon} ${name}`);
    console.log(`    Status: ${d.status || 'unknown'} | ${autoRenew} | Expires: ${expires}`);
    if (access.hasAccess) console.log(`    ${nsLabel}`);
    if (!access.hasAccess) console.log(`    ⚠ ${access.error || 'Enable API access in Porkbun dashboard'}`);
    console.log('');

    results.push({
      domain: name,
      status: d.status,
      autoRenew: d.autoRenew === 1,
      expireDate: d.expireDate,
      apiAccess: access.hasAccess,
      nameservers: access.nameservers,
      error: access.error
    });
  }

  const reportPath = writeReport(`domains-${utcStamp()}.json`, {
    checkedAt: new Date().toISOString(),
    totalDomains: domains.length,
    domains: results
  });
  console.log(`  Report: ${reportPath}`);
  return 0;
}

async function cmdNsAudit(flags) {
  const env = resolveEnv(flags);
  const { apiKey, secretKey } = requirePorkbunCreds(env);

  // Load site profile
  const site = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags });
  const domain = site.zoneName;
  if (!domain) throw new Error('Missing zone name in site profile.');

  // Check registrar metadata
  const registrar = String(site.profile?.metadata?.registrar || '').toLowerCase();
  if (registrar && registrar !== 'porkbun') {
    throw new Error(`Site profile registrar is "${registrar}", not "porkbun". This tool only supports Porkbun.`);
  }

  console.log('\nRegistrar NS audit');
  console.log(`  Domain: ${domain}`);
  console.log(`  Profile: ${site.profile.siteId}`);

  // Step 1: Get current NS from Porkbun
  console.log('\n  [1/3] Checking Porkbun nameservers...');
  const currentNs = await porkbunGetNs(apiKey, secretKey, domain);
  console.log(`        Current NS: ${currentNs.join(', ') || '(none)'}`);

  // Step 2: Get Cloudflare-assigned NS
  console.log('  [2/3] Checking Cloudflare-assigned nameservers...');
  let cloudflareNs = [];
  let zoneStatus = 'unknown';
  let zoneId = '';
  let zoneExists = false;

  try {
    const cfAuth = resolveCloudflareCredential(env, { allowWranglerOauth: true });
    const zone = await resolveZoneByName(cfAuth.token, domain);
    cloudflareNs = Array.isArray(zone.name_servers) ? zone.name_servers : [];
    zoneStatus = zone.status || 'unknown';
    zoneId = zone.id || '';
    zoneExists = true;
    console.log(`        CF zone: ${zone.name} (${zone.id}) — status: ${zoneStatus}`);
    console.log(`        CF nameservers: ${cloudflareNs.join(', ')}`);
  } catch (err) {
    console.log(`        ⚠ Cloudflare zone not found or not accessible: ${err.message}`);
    console.log(`        → Run: registrar zone ensure --site-profile <path> to add it`);
  }

  // Step 3: Compare
  console.log('  [3/3] Comparing...');
  const currentSet = new Set(currentNs.map(ns => ns.toLowerCase()));
  const expectedSet = new Set(cloudflareNs.map(ns => ns.toLowerCase()));
  const match = currentSet.size === expectedSet.size && [...currentSet].every(ns => expectedSet.has(ns));

  if (match && cloudflareNs.length > 0) {
    console.log('        ✓ Nameservers correctly point to Cloudflare');
  } else if (cloudflareNs.length === 0) {
    console.log('        ✗ Cannot compare — Cloudflare zone not found');
  } else {
    console.log('        ✗ Nameserver mismatch');
    console.log(`          Current:  ${currentNs.join(', ')}`);
    console.log(`          Expected: ${cloudflareNs.join(', ')}`);
    console.log(`          → Run: registrar ns update --site-profile <path> --apply`);
  }

  const report = {
    checkedAt: new Date().toISOString(),
    domain,
    profile: site.profile.siteId,
    registrar: 'porkbun',
    currentNameservers: currentNs,
    cloudflareNameservers: cloudflareNs,
    cloudflareZone: { id: zoneId, status: zoneStatus, exists: zoneExists },
    match
  };

  const reportPath = writeReport(`ns-audit-${domain.replaceAll('.', '_')}-${utcStamp()}.json`, report);
  console.log(`\n  Report: ${reportPath}`);
  return match ? 0 : 2;
}

async function cmdNsUpdate(flags) {
  const env = resolveEnv(flags);
  const { apiKey, secretKey } = requirePorkbunCreds(env);
  const apply = toBool(flags.apply, false);

  // Load site profile
  const site = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags });
  const domain = site.zoneName;
  if (!domain) throw new Error('Missing zone name in site profile.');

  console.log(`\nRegistrar NS update${apply ? '' : ' [DRY RUN]'}`);
  console.log(`  Domain: ${domain}`);
  console.log(`  Profile: ${site.profile.siteId}`);

  // Get current NS from Porkbun
  console.log('\n  [1/4] Checking current Porkbun nameservers...');
  const currentNs = await porkbunGetNs(apiKey, secretKey, domain);
  console.log(`        Current: ${currentNs.join(', ')}`);

  // Get Cloudflare-assigned NS
  console.log('  [2/4] Getting Cloudflare-assigned nameservers...');
  const cfAuth = resolveCloudflareCredential(env, { allowWranglerOauth: true });
  const zone = await resolveZoneByName(cfAuth.token, domain);
  const cloudflareNs = Array.isArray(zone.name_servers) ? zone.name_servers : [];
  if (cloudflareNs.length === 0) {
    throw new Error('Cloudflare has not assigned nameservers for this zone. Is the zone added?');
  }
  console.log(`        Target:  ${cloudflareNs.join(', ')}`);

  // Check if already matching
  const currentSet = new Set(currentNs.map(ns => ns.toLowerCase()));
  const expectedSet = new Set(cloudflareNs.map(ns => ns.toLowerCase()));
  const alreadyMatch = currentSet.size === expectedSet.size && [...currentSet].every(ns => expectedSet.has(ns));

  if (alreadyMatch) {
    console.log('\n  ✓ Nameservers already point to Cloudflare. No update needed.');
    return 0;
  }

  // Update
  console.log('  [3/4] Updating nameservers at Porkbun...');
  let updateResult = null;
  if (apply) {
    await porkbunUpdateNs(apiKey, secretKey, domain, cloudflareNs);
    console.log(`        ✓ Updated to: ${cloudflareNs.join(', ')}`);

    // Verify
    console.log('  [4/4] Verifying update...');
    const verifyNs = await porkbunGetNs(apiKey, secretKey, domain);
    const verifySet = new Set(verifyNs.map(ns => ns.toLowerCase()));
    const verified = verifySet.size === expectedSet.size && [...verifySet].every(ns => expectedSet.has(ns));
    if (verified) {
      console.log('        ✓ Verified — registrar NS now match Cloudflare');
    } else {
      console.log(`        ⚠ Verification mismatch — registrar reports: ${verifyNs.join(', ')}`);
      console.log('          This may resolve with a small delay. Re-run ns audit to check.');
    }
    updateResult = { action: 'applied', verified, verifiedNs: verifyNs };
  } else {
    console.log(`        [dry-run] Would update from: ${currentNs.join(', ')}`);
    console.log(`        [dry-run] Would update to:   ${cloudflareNs.join(', ')}`);
    console.log('  [4/4] Skipped (dry-run)');
    console.log('\n  → To apply: registrar ns update --site-profile <path> --apply');
    updateResult = { action: 'dry-run' };
  }

  const report = {
    checkedAt: new Date().toISOString(),
    domain,
    profile: site.profile.siteId,
    apply,
    previousNameservers: currentNs,
    targetNameservers: cloudflareNs,
    cloudflareZone: { id: zone.id, name: zone.name, status: zone.status },
    result: updateResult
  };

  const reportPath = writeReport(`ns-update-${domain.replaceAll('.', '_')}-${utcStamp()}.json`, report);
  console.log(`\n  Report: ${reportPath}`);
  return 0;
}

async function cmdZoneEnsure(flags) {
  const env = resolveEnv(flags);
  const apply = toBool(flags.apply, false);

  // Load site profile
  const site = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags });
  const domain = site.zoneName;
  if (!domain) throw new Error('Missing zone name in site profile.');

  console.log(`\nCloudflare zone ensure${apply ? '' : ' [DRY RUN]'}`);
  console.log(`  Domain: ${domain}`);
  console.log(`  Profile: ${site.profile.siteId}`);

  // Use any available credential (OAuth OK for reads)
  const cfAuth = resolveCloudflareCredential(env, { allowWranglerOauth: true });

  // Check if zone already exists
  console.log('\n  [1/2] Checking for existing Cloudflare zone...');
  let zone = null;
  try {
    zone = await resolveZoneByName(cfAuth.token, domain);
    console.log(`        ✓ Zone exists: ${zone.name} (${zone.id}) — status: ${zone.status}`);
    console.log(`        Nameservers: ${(zone.name_servers || []).join(', ')}`);

    if (zone.status === 'active') {
      console.log('        ✓ Zone is active — no action needed');
    } else if (zone.status === 'pending') {
      console.log('        ⚠ Zone is pending — update nameservers at registrar');
      console.log('          → Run: registrar ns update --site-profile <path> --apply');
    }

    return 0;
  } catch {
    console.log('        Zone not found — needs to be created');
  }

  // Create zone
  console.log('  [2/2] Adding zone to Cloudflare...');

  if (!apply) {
    console.log(`        [dry-run] Would add zone: ${domain}`);
    console.log('\n  → To apply: registrar zone ensure --site-profile <path> --apply');
    return 0;
  }

  // Need account ID. Try to get from profile, env, or existing zones.
  let accountId = String(site.profile?.cloudflare?.account?.id || env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim();

  if (!accountId) {
    // Try to discover account ID from existing zones
    console.log('        Discovering account ID from existing zones...');
    const zonesResult = await safeCloudflareRequest(cfAuth.token, '/zones?per_page=1');
    if (zonesResult.ok && zonesResult.payload?.result?.length > 0) {
      accountId = zonesResult.payload.result[0].account?.id || '';
    }
  }

  if (!accountId) {
    throw new Error('Cannot determine Cloudflare account ID. Set CLOUDFLARE_ACCOUNT_ID in .env or cloudflare.account.id in the site profile.');
  }

  console.log(`        Account ID: ${accountId}`);

  try {
    const createResult = await cloudflareRequest(cfAuth.token, '/zones', {
      method: 'POST',
      body: {
        name: domain,
        account: { id: accountId },
        type: 'full'
      }
    });

    zone = createResult?.result || {};
    const assignedNs = zone.name_servers || [];

    console.log(`        ✓ Zone created: ${zone.name} (${zone.id})`);
    console.log(`        Status: ${zone.status}`);
    console.log(`        Assigned nameservers: ${assignedNs.join(', ')}`);
    console.log('\n  → Next: registrar ns update --site-profile <path> --apply');

    const report = {
      checkedAt: new Date().toISOString(),
      domain,
      profile: site.profile.siteId,
      action: 'created',
      zone: {
        id: zone.id,
        name: zone.name,
        status: zone.status,
        nameServers: assignedNs
      },
      accountId
    };

    const reportPath = writeReport(`zone-ensure-${domain.replaceAll('.', '_')}-${utcStamp()}.json`, report);
    console.log(`  Report: ${reportPath}`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('permission') || msg.includes('Invalid access') || msg.includes('9109') || msg.includes('10000')) {
      console.log(`        ✗ Insufficient permissions to create zone: ${msg}`);
      console.log('');
      console.log('        Options to add the zone:');
      console.log('        1. Create a Cloudflare API token with Zone:Edit scope and set CLOUDFLARE_API_TOKEN in .env');
      console.log(`        2. Add "${domain}" manually via https://dash.cloudflare.com → Add a site`);
      console.log('        3. Run: npx wrangler pages project create <project-name>');
      console.log('');
      console.log('        After adding the zone, re-run this command to verify, then run:');
      console.log('          registrar ns update --site-profile <path> --apply');
      return 2;
    }
    throw err;
  }
}

// ── Status (pipeline checker) ──

async function cmdStatus(flags) {
  const useAll = toBool(flags.all, false);

  if (useAll) {
    // Scan all profiles in site-profiles/
    const profileDir = path.join(PORTABLE_ROOT, 'site-profiles');
    if (!fs.existsSync(profileDir)) { console.error('No site-profiles/ directory found.'); return 1; }
    const profileFiles = fs.readdirSync(profileDir).filter(f => f.endsWith('.json') && !f.startsWith('.'));
    if (profileFiles.length === 0) { console.error('No site profiles found in site-profiles/.'); return 1; }

    console.log(`\n══════════════════════════════════════════════════`);
    console.log(`  Migration Dashboard — ${profileFiles.length} profile(s)`);
    console.log(`══════════════════════════════════════════════════`);

    let allComplete = true;
    for (const file of profileFiles) {
      const profilePath = path.join(profileDir, file);
      const relPath = `site-profiles/${file}`;
      try {
        const code = await runSingleStatus({ ...flags, 'site-profile': profilePath }, relPath);
        if (code !== 0) allComplete = false;
      } catch (err) {
        console.log(`\n  ✗ ${file}: ${err.message}`);
        allComplete = false;
      }
    }

    console.log(`\n══════════════════════════════════════════════════`);
    console.log(`  Overall: ${allComplete ? '✓ ALL COMPLETE' : 'ACTION REQUIRED on one or more domains'}`);
    console.log(`══════════════════════════════════════════════════\n`);
    return allComplete ? 0 : 2;
  }

  // Single profile mode
  const profileFlag = String(flags['site-profile'] || '').trim();
  return runSingleStatus(flags, profileFlag);
}

async function runSingleStatus(flags, siteProfileFlag) {
  const env = resolveEnv(flags);
  const site = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags });
  const domain = site.zoneName;
  if (!domain) throw new Error('Missing zone name in site profile.');

  let porkbunCreds = null;
  try { porkbunCreds = requirePorkbunCreds(env); } catch { /* optional */ }

  const result = checkMigrationPipeline({
    domain,
    profile: site.profile,
    env,
    porkbunCreds,
    siteProfileFlag: siteProfileFlag || `site-profiles/${site.profile?.siteId || 'unknown'}.json`
  });

  // Console output
  const icons = { pass: '✓', fail: '✗', wait: '⏳', skip: '—' };
  console.log(`\nMigration pipeline: ${result.domain}`);
  console.log(`  Profile: ${result.profile} | Type: ${result.type}`);
  console.log('');

  const pad = (s, n) => String(s).padEnd(n);
  for (let i = 0; i < result.steps.length; i++) {
    const s = result.steps[i];
    const num = `${i + 1}/${result.total}`;
    const icon = icons[s.status] || '?';
    console.log(`  ${pad(num, 5)} ${pad(s.label, 24)} ${icon} ${s.status.padEnd(5)} ${s.detail}`);
    if (s.gate) {
      console.log('  ═══════════════════════════════════════════════════════');
      console.log('  GATE: Zone must be active before continuing');
      console.log('  ═══════════════════════════════════════════════════════');
    }
  }

  console.log('');
  console.log(`  Pipeline: ${result.passed}/${result.total} steps complete`);

  if (result.nextAction) {
    if (result.nextAction.type === 'complete') {
      console.log('  RESULT: ✓ COMPLETE');
    } else if (result.nextAction.type === 'wait') {
      console.log(`  RESULT: WAITING — ${result.nextAction.description}`);
      console.log(`  ACTION: Re-run status to check again`);
    } else {
      console.log(`  RESULT: ACTION REQUIRED — ${result.nextAction.description}`);
    }
    if (result.nextAction.command) {
      console.log(`  CMD:    ${result.nextAction.command}`);
    }
  }

  const reportPath = writeReport(`status-${domain.replaceAll('.', '_')}-${utcStamp()}.json`, result);
  console.log(`  Report: ${reportPath}`);

  return result.nextAction?.type === 'complete' ? 0 : 2;
}

// ── Redirect setup ──

async function cmdRedirectSetup(flags) {
  const env = resolveEnv(flags);
  const apply = toBool(flags.apply, false);
  const site = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags });
  const domain = site.zoneName;
  if (!domain) throw new Error('Missing zone name in site profile.');

  const cfAuth = resolveCloudflareCredential(env, { allowWranglerOauth: !apply, requireApiToken: apply });

  const result = runRedirect({
    domain,
    profile: site.profile,
    token: cfAuth.token,
    apply
  });

  const reportPath = writeReport(`redirect-${domain.replaceAll('.', '_')}-${utcStamp()}.json`, {
    checkedAt: new Date().toISOString(),
    ...result
  });
  console.log(`\n  Report: ${reportPath}`);
  return 0;
}

// ── Help ──

function printHelp() {
  console.log(`
registrar — Portable registrar & domain migration tool

Usage:
  registrar <command> [subcommand] [--flags]

Pipeline Commands (run in order):
  status --site-profile <path>
      Full migration pipeline status. Shows every step, gates on
      prerequisites, and tells you the exact next command to run.
      THIS IS THE RECOMMENDED STARTING COMMAND.

  ping
      Verify Porkbun API credentials.

  domains
      List all domains in Porkbun account with API access status.

  zone ensure --site-profile <path> [--apply]
      Add domain as a Cloudflare zone if it doesn't exist yet.

  ns audit --site-profile <path>
      Compare current registrar nameservers against Cloudflare-assigned NS.

  ns update --site-profile <path> [--apply]
      Update registrar nameservers to Cloudflare.

  redirect --site-profile <path> [--apply]
      Create Cloudflare redirect rules for alias/vanity domains.
      Sets up proxy DNS (AAAA 100::) and a 301 dynamic redirect rule.

  help
      Show this message.

Environment:
  PORKBUN_API_KEY         Porkbun API key (required for registrar ops)
  PORKBUN_SECRET_KEY      Porkbun secret key (required for registrar ops)
  CLOUDFLARE_API_TOKEN    Cloudflare API token (required for zone/dns ops)
  CLOUDFLARE_ACCOUNT_ID   Cloudflare account ID (auto-discovered if missing)

Examples:
  node registrar/registrar.mjs status --site-profile site-profiles/mysite.json
  node registrar/registrar.mjs ping
  node registrar/registrar.mjs domains
  node registrar/registrar.mjs zone ensure --site-profile site-profiles/mysite.json --apply
  node registrar/registrar.mjs ns update --site-profile site-profiles/mysite.json --apply
  node registrar/registrar.mjs redirect --site-profile site-profiles/mysite.json --apply
`.trim());
}

// ── Main ──

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const [primary = 'help', secondary = ''] = command.map(s => String(s).toLowerCase());

  if (primary === 'help' || primary === '--help' || primary === '-h') {
    printHelp();
    return 0;
  }

  if (primary === 'ping') return cmdPing(flags);
  if (primary === 'domains') return cmdDomains(flags);
  if (primary === 'status') return cmdStatus(flags);
  if (primary === 'ns' && secondary === 'audit') return cmdNsAudit(flags);
  if (primary === 'ns' && secondary === 'update') return cmdNsUpdate(flags);
  if (primary === 'zone' && secondary === 'ensure') return cmdZoneEnsure(flags);
  if (primary === 'redirect') return cmdRedirectSetup(flags);

  console.error(`Unknown command: ${[primary, secondary].filter(Boolean).join(' ')}`);
  console.error('Run `registrar help` for usage.');
  return 1;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    console.error('\n[registrar] failed');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

