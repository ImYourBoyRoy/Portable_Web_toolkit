// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/context.mjs
/**
 * `cf-agent context`: which Cloudflare identity this site's commands act as.
 *
 * Several sites can live in different Cloudflare accounts. cf-agent resolves credentials per project (project-root
 * .env, never a global login), while a Cloudflare plugin/connector is authenticated as ONE account at a time. Before
 * mixing the two, print the account, zone, and token this site resolves to (ids and names only, never secrets) so an
 * agent can see whether the plugin's account matches. Read-only; makes three GETs.
 */

import path from 'node:path';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { verifyToken, resolveZoneByName, cloudflareRequest } from '../lib/cloudflare-api.mjs';
import { prettyJson, toBool } from '../lib/format.mjs';

export async function runContext(site, flags = {}) {
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const token = envValue(env, 'CLOUDFLARE_API_TOKEN', '');
  const report = { site: site.profile?.siteId ?? path.basename(site.projectRoot), projectRoot: site.projectRoot, zoneName: site.zoneName || null, token: null, account: null, zone: null, note: 'A Cloudflare plugin/connector acts as one account at a time; compare its account with account.id before using it on this site. cf-agent always uses the token above.' };
  if (!token) {
    report.token = { ok: false, error: 'CLOUDFLARE_API_TOKEN is not set in the project .env or the environment' };
  } else {
    try {
      const verified = await verifyToken(token);
      report.token = { ok: true, id: verified?.result?.id ?? null, status: verified?.result?.status ?? null };
    } catch (error) {
      report.token = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  if (report.token?.ok && site.zoneName) {
    try {
      const zone = await resolveZoneByName(token, site.zoneName);
      report.zone = { id: zone.id, name: zone.name, status: zone.status, plan: zone.plan?.name ?? null };
      report.account = { id: zone.account?.id ?? null, name: zone.account?.name ?? null, source: 'zone' };
    } catch (error) {
      report.zone = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  const configured = String(site.profile?.cloudflare?.account?.id || envValue(env, 'CLOUDFLARE_ACCOUNT_ID', '') || '').trim();
  if (configured) {
    report.configuredAccountId = configured;
    if (report.account?.id && report.account.id !== configured) report.accountMismatch = `profile/.env account ${configured} differs from the zone's account ${report.account.id}`;
    if (!report.account) {
      try {
        const payload = await cloudflareRequest(token, `/accounts/${configured}`);
        report.account = { id: configured, name: payload?.result?.name ?? null, source: 'configured' };
      } catch { report.account = { id: configured, name: null, source: 'configured' }; }
    }
  }
  if (toBool(flags.json, false)) {
    console.log(prettyJson(report));
  } else {
    console.log(`site ${report.site} | zone ${report.zone?.name ?? report.zoneName ?? '-'} (${report.zone?.status ?? 'unresolved'}) | account ${report.account?.name ?? '?'} ${report.account?.id ?? ''} | token ${report.token?.ok ? `ok (${report.token.status})` : `FAILED: ${report.token?.error}`}`);
    if (report.accountMismatch) console.log(`WARNING ${report.accountMismatch}`);
    console.log(report.note);
  }
  return report.token?.ok && !report.accountMismatch ? 0 : 2;
}
