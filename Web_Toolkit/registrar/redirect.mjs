// ./Web_Toolkit/registrar/redirect.mjs
/**
 * Cloudflare redirect rule creator for alias/vanity domains.
 *
 * Reads redirectTarget from the site profile and creates a Cloudflare
 * Dynamic Redirect rule that forwards all traffic (including path) to
 * the target domain. Also ensures proxy DNS records (AAAA 100::) exist
 * so Cloudflare can intercept the traffic.
 *
 * Run: node registrar/registrar.mjs redirect --site-profile <path> [--apply]
 * Inputs: site profile with cloudflare.redirectTarget set
 * Outputs: console summary + JSON report in .runtime/reports/registrar/
 * Notes: Dry-run by default. Pass --apply to mutate.
 */

import { resolveZoneByName, cloudflareRequest, safeCloudflareRequest } from '../cloudflare-agent-toolkit/src/lib/cloudflare-api.mjs';

/**
 * Ensure proxy DNS records exist for redirect interception.
 * Creates AAAA 100:: records for each production host if missing.
 */
async function ensureProxyDns(token, zoneId, hosts, apply) {
  const dnsRes = await safeCloudflareRequest(token, `/zones/${zoneId}/dns_records?per_page=200`);
  const live = dnsRes.ok ? (dnsRes.payload?.result || []) : [];
  const actions = [];

  for (const host of hosts) {
    const existing = live.find(
      (r) => r.name.toLowerCase() === host.toLowerCase() && (r.type === 'AAAA' || r.type === 'A' || r.type === 'CNAME')
    );
    if (existing) {
      actions.push({ host, action: 'exists', type: existing.type, content: existing.content, proxied: existing.proxied });
      continue;
    }
    if (!apply) {
      actions.push({ host, action: 'dry-run-create', type: 'AAAA', content: '100::' });
      continue;
    }
    await cloudflareRequest(token, `/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: { type: 'AAAA', name: host, content: '100::', proxied: true, ttl: 1 }
    });
    actions.push({ host, action: 'created', type: 'AAAA', content: '100::' });
  }
  return actions;
}

/**
 * Create or update a Cloudflare Dynamic Redirect rule.
 * Uses the modern Rulesets API (phase: http_request_dynamic_redirect).
 */
async function ensureRedirectRule(token, zoneId, domain, hosts, redirectTarget, apply) {
  const expression = hosts.map((h) => `(http.host eq "${h}")`).join(' or ');
  const description = `Redirect ${domain} → ${redirectTarget}`;

  const newRule = {
    action: 'redirect',
    expression,
    description,
    enabled: true,
    action_parameters: {
      from_value: {
        target_url: {
          expression: `concat("https://${redirectTarget}", http.request.uri.path)`
        },
        status_code: 301,
        preserve_query_string: true
      }
    }
  };

  // Check existing entrypoint
  const entryRes = await safeCloudflareRequest(token,
    `/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`);

  if (entryRes.ok) {
    const ruleset = entryRes.payload?.result || {};
    const existingRules = Array.isArray(ruleset.rules) ? ruleset.rules : [];
    const alreadyExists = existingRules.some(
      (r) => r.action === 'redirect' && r.expression?.includes(domain)
    );

    if (alreadyExists) {
      return { action: 'exists', rulesetId: ruleset.id, description };
    }

    if (!apply) {
      return { action: 'dry-run-add', rulesetId: ruleset.id, ruleCount: existingRules.length + 1 };
    }

    // Add our rule to existing ruleset
    await cloudflareRequest(token, `/zones/${zoneId}/rulesets/${ruleset.id}`, {
      method: 'PUT',
      body: {
        name: ruleset.name || 'Redirects',
        kind: ruleset.kind || 'zone',
        phase: 'http_request_dynamic_redirect',
        rules: [...existingRules, newRule]
      }
    });
    return { action: 'added', rulesetId: ruleset.id, ruleCount: existingRules.length + 1 };
  }

  // No entrypoint exists — create from scratch
  if (!apply) {
    return { action: 'dry-run-create', ruleCount: 1 };
  }

  const created = await cloudflareRequest(token, `/zones/${zoneId}/rulesets`, {
    method: 'POST',
    body: {
      name: 'Redirects',
      kind: 'zone',
      phase: 'http_request_dynamic_redirect',
      rules: [newRule]
    }
  });
  return { action: 'created', rulesetId: created?.result?.id, ruleCount: 1 };
}

/**
 * Main redirect runner.
 *
 * @param {Object} opts
 * @param {string} opts.domain - The redirect source domain
 * @param {Object} opts.profile - Parsed site profile
 * @param {string} opts.token - Cloudflare API/OAuth token
 * @param {boolean} opts.apply - Whether to mutate
 * @returns {{ dnsActions, ruleResult, report }}
 */
export async function runRedirect(opts) {
  const { domain, profile, token, apply } = opts;
  const redirectTarget = String(profile?.cloudflare?.redirectTarget || '').trim();
  if (!redirectTarget) throw new Error('Profile has no cloudflare.redirectTarget set.');

  const hosts = [...(profile?.hosts?.production || [])];
  if (hosts.length === 0) throw new Error('Profile has no production hosts defined.');

  const zone = await resolveZoneByName(token, domain);
  if (zone.status !== 'active') {
    throw new Error(`Zone "${domain}" is not active (status: ${zone.status}). Wait for activation first.`);
  }

  console.log(`\nCloudflare redirect setup${apply ? '' : ' [DRY RUN]'}`);
  console.log(`  Domain: ${domain} → ${redirectTarget}`);
  console.log(`  Zone: ${zone.id} (${zone.status})`);
  console.log(`  Hosts: ${hosts.join(', ')}`);

  // Step 1: Ensure proxy DNS
  console.log('\n  [1/2] DNS proxy records...');
  const dnsActions = await ensureProxyDns(token, zone.id, hosts, apply);
  for (const a of dnsActions) {
    const icon = a.action === 'exists' ? '✓' : a.action.startsWith('dry-run') ? '○' : '✓';
    console.log(`        ${icon} ${a.host} ${a.type} ${a.content} [${a.action}]`);
  }

  // Step 2: Redirect rule
  console.log('  [2/2] Redirect rule...');
  const ruleResult = await ensureRedirectRule(token, zone.id, domain, hosts, redirectTarget, apply);
  const ruleIcon = ruleResult.action === 'exists' ? '✓' : ruleResult.action.startsWith('dry-run') ? '○' : '✓';
  console.log(`        ${ruleIcon} ${ruleResult.action} (${ruleResult.ruleCount || 0} rule(s))`);

  if (!apply && (dnsActions.some((a) => a.action.startsWith('dry-run')) || ruleResult.action.startsWith('dry-run'))) {
    console.log('\n  → To apply: registrar redirect --site-profile <path> --apply');
  }

  return {
    domain,
    redirectTarget,
    zone: { id: zone.id, status: zone.status },
    apply,
    dnsActions,
    ruleResult
  };
}

