// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/deployment-audit.mjs
/**
 * Account-level deployment audit — no production zone required.
 * Verifies Pages projects, Worker scripts, and live development host URLs.
 */

import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { resolveCloudflareCredential, summarizeAuthSource } from '../lib/auth.mjs';
import {
  listPagesProjects,
  listWorkerScripts,
  resolveZoneByName,
} from '../lib/cloudflare-api.mjs';
import { prettyJson, utcStamp } from '../lib/format.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';
import { resolveWorkerName, resolvePagesProjectName, workersDevUrl } from '../lib/deploy/context.mjs';

async function resolveAccountId(token, site) {
  const fromProfile = String(site.profile?.cloudflare?.account?.id || '').trim();
  if (fromProfile) return fromProfile;

  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const fromEnv = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim();
  if (fromEnv) return fromEnv;

  if (site.zoneName) {
    const zone = await resolveZoneByName(token, site.zoneName);
    const accountId = zone?.account?.id;
    if (accountId) return accountId;
  }

  throw new Error(
    'Missing account ID. Set cloudflare.account.id in the site profile, CLOUDFLARE_ACCOUNT_ID in .env, or add a zone on this account.',
  );
}

async function probeHttp(url) {
  if (!url || url.startsWith('http://localhost')) {
    return { url, skipped: true, reason: 'local-only host' };
  }
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  try {
    const response = await fetch(normalized, { method: 'HEAD', redirect: 'manual' });
    return {
      url: normalized,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
    };
  } catch (error) {
    return {
      url: normalized,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeDns(hostname) {
  try {
    await dns.lookup(hostname);
    return { hostname, resolves: true };
  } catch (error) {
    return {
      hostname,
      resolves: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runDeploymentAudit(flags = {}) {
  const site = loadSiteProfile(flags);
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const auth = resolveCloudflareCredential(env, { allowWranglerOauth: true });
  const token = auth.token;
  const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));

  const accountId = await resolveAccountId(token, site);
  const pagesEnabled = site.profile?.cloudflare?.pagesEnabled !== false
    && site.profile?.deployTarget !== 'workers';
  const workerName = resolveWorkerName(flags, site.profile, site.projectRoot);
  const configuredSubdomain = String(site.profile?.cloudflare?.workersDevSubdomain || '').trim();

  const pagesProject = pagesEnabled
    ? resolvePagesProjectName(flags, site.profile, site.projectRoot)
    : null;

  const [pagesProjects, workerScripts] = await Promise.all([
    pagesEnabled ? listPagesProjects(token, accountId) : Promise.resolve([]),
    listWorkerScripts(token, accountId),
  ]);

  const pagesMatch = pagesProject
    ? pagesProjects.find((entry) => entry.name === pagesProject)
    : null;
  const workerMatch = workerScripts.find((entry) => entry.id === workerName);

  const subdomainCandidates = [...new Set([configuredSubdomain, 'example-demo', 'demo'].filter(Boolean))];
  const workersDevChecks = [];
  for (const subdomain of subdomainCandidates) {
    const hostname = `${workerName}.${subdomain}.workers.dev`;
    const dnsResult = await probeDns(hostname);
    const httpResult = dnsResult.resolves ? await probeHttp(`https://${hostname}/`) : { url: `https://${hostname}/`, ok: false, skipped: true, reason: 'dns-not-found' };
    workersDevChecks.push({ subdomain, hostname, dns: dnsResult, http: httpResult });
  }

  const liveSubdomain = workersDevChecks.find((entry) => entry.dns.resolves)?.subdomain || null;
  const devHostChecks = await Promise.all(site.developmentHosts.map((host) => probeHttp(host)));

  const issues = [];
  if (pagesEnabled && !pagesMatch) issues.push(`Pages project "${pagesProject}" not found in account.`);
  if (!workerMatch) issues.push(`Worker script "${workerName}" not found in account.`);
  if (configuredSubdomain && configuredSubdomain !== liveSubdomain) {
    issues.push(
      `Profile workersDevSubdomain "${configuredSubdomain}" does not resolve. Live subdomain appears to be "${liveSubdomain || 'unknown'}". Update Cloudflare dashboard → Workers & Pages → Change subdomain.`,
    );
  }
  for (const check of devHostChecks) {
    if (check.skipped) continue;
    if (!check.ok) issues.push(`Development host unreachable: ${check.url} (${check.error || check.status})`);
  }

  const report = {
    checkedAt: new Date().toISOString(),
    profile: site.profile.siteId,
    auth: { source: auth.source, label: summarizeAuthSource(auth) },
    accountId,
    zoneAuditNote: site.zoneName
      ? 'Full zone audit requires kristenulmer.com on this Cloudflare account — use `cf-agent site audit` when the zone exists.'
      : 'No zone configured.',
    expected: {
      deployTarget: site.profile?.deployTarget || 'pages',
      pagesEnabled,
      pagesProject,
      workerName,
      workersDevSubdomain: configuredSubdomain || null,
      workersDevUrl: liveSubdomain ? workersDevUrl(workerName, liveSubdomain) : null,
      configuredWorkersDevUrl: configuredSubdomain ? workersDevUrl(workerName, configuredSubdomain) : null,
    },
    pagesProjects: pagesProjects.map((entry) => ({
      name: entry.name,
      subdomain: entry.subdomain,
      lastDeployment: entry.latest_deployment?.url || null,
    })),
    workerScripts: workerScripts.map((entry) => entry.id),
    workersDevChecks,
    developmentHostChecks: devHostChecks,
    issues,
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `deployment-audit-${site.profile.siteId}-${utcStamp()}.json`);
  fs.writeFileSync(outputPath, prettyJson(report), 'utf8');

  console.log('\nCloudflare deployment audit');
  console.log(`- Profile: ${site.profile.siteId}`);
  console.log(`- Account: ${accountId}`);
  if (pagesEnabled) {
    console.log(`- Pages project "${pagesProject}": ${pagesMatch ? 'found' : 'MISSING'}`);
  } else {
    console.log('- Pages: disabled (Workers-only deploy target)');
  }
  console.log(`- Worker "${workerName}": ${workerMatch ? 'found' : 'MISSING'}`);
  console.log(`- Live workers.dev subdomain: ${liveSubdomain || '(none resolved)'}`);
  if (configuredSubdomain && configuredSubdomain !== liveSubdomain) {
    console.log(`- Profile expects subdomain "${configuredSubdomain}" — DNS does NOT match (this breaks ${workerName}.${configuredSubdomain}.workers.dev)`);
  }
  console.log('\nDevelopment hosts:');
  for (const check of devHostChecks) {
    if (check.skipped) {
      console.log(`  • ${check.url} — skipped (${check.reason})`);
    } else {
      console.log(`  • ${check.url} — ${check.ok ? 'OK' : 'FAIL'} ${check.status ?? check.error ?? ''}`);
    }
  }
  if (issues.length > 0) {
    console.log('\nIssues:');
    for (const issue of issues) {
      console.log(`  • ${issue}`);
    }
  } else {
    console.log('\nNo deployment issues detected.');
  }
  console.log(`\nReport: ${outputPath}`);

  return issues.length > 0 ? 2 : 0;
}
