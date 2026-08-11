// ./Web_Toolkit/registrar/status.mjs
/**
 * Migration pipeline status checker.
 *
 * Single command that audits every step of the domain migration pipeline
 * (registrar → Cloudflare zone → DNS → Pages/redirect → hardening).
 * Gate-aware: stops at blocking prerequisites and tells the caller exactly
 * what to do next. Designed for AI agent consumption.
 *
 * Run: node registrar/registrar.mjs status --site-profile <path>
 * Inputs: site profile path (--site-profile flag)
 * Outputs: console pipeline table + JSON report in .runtime/reports/registrar/
 */

import { porkbunCheckDomainAccess } from './porkbun-api.mjs';
import { resolveZoneByName, safeCloudflareRequest, listAllDnsRecords } from '../cloudflare-agent-toolkit/src/lib/cloudflare-api.mjs';
import { resolveCloudflareCredential } from '../cloudflare-agent-toolkit/src/lib/auth.mjs';
import { auditEmailDns } from '../cloudflare-agent-toolkit/src/lib/audit/email-dns.mjs';
import { apexHasMx } from './mx-gate.mjs';

// ── Helpers ──

function step(id, label, status, detail, extra = {}) {
  return { id, label, status, detail, ...extra };
}

/**
 * Derive expected DNS records from profile fields.
 * Prefers explicit expectedRecords; falls back to auto-derived records
 * based on pagesProject (CNAME) or redirectTarget (AAAA proxy).
 */
function deriveExpectedRecords(profile) {
  const explicit =
    profile?.cloudflare?.dns?.expectedRecords ||
    profile?.cloudflare?.dns?.records ||
    [];
  if (explicit.length > 0 && explicit.some((r) => r.content)) return explicit;

  const pagesProject = String(profile?.cloudflare?.pagesProject || '').trim();
  const redirectTarget = String(profile?.cloudflare?.redirectTarget || '').trim();
  const hosts = [...(profile?.hosts?.production || [])];

  if (pagesProject && hosts.length > 0) {
    return hosts.map((h) => ({ name: h, type: 'CNAME', content: `${pagesProject}.pages.dev`, proxied: true }));
  }
  if (redirectTarget && hosts.length > 0) {
    return hosts.map((h) => ({ name: h, type: 'AAAA', content: '100::', proxied: true }));
  }
  return [];
}

function resolveAccountId(profile, env, zoneData) {
  return String(
    profile?.cloudflare?.account?.id ||
    env?.CLOUDFLARE_ACCOUNT_ID ||
    env?.CF_ACCOUNT_ID ||
    zoneData?.account?.id ||
    ''
  ).trim();
}

// ── Pipeline checks ──

async function checkRegistrar(domain, creds) {
  if (!creds) return step('registrar_access', 'Registrar API access', 'skip', 'No Porkbun credentials (PORKBUN_API_KEY)');
  try {
    const access = await porkbunCheckDomainAccess(creds.apiKey, creds.secretKey, domain);
    if (access.hasAccess) {
      return step('registrar_access', 'Registrar API access', 'pass',
        `API enabled | NS: ${access.nameservers.join(', ')}`, { nameservers: access.nameservers });
    }
    return step('registrar_access', 'Registrar API access', 'fail',
      access.error || 'API access not enabled in Porkbun dashboard');
  } catch (err) {
    return step('registrar_access', 'Registrar API access', 'fail', `Error: ${err.message}`);
  }
}

async function checkZone(domain, cfToken) {
  if (!cfToken) return step('cloudflare_zone', 'Cloudflare zone', 'fail', 'No Cloudflare credential available');
  try {
    const zone = await resolveZoneByName(cfToken, domain);
    return step('cloudflare_zone', 'Cloudflare zone', 'pass',
      `${zone.id.slice(0, 8)}… (${zone.status})`, { zone });
  } catch {
    return step('cloudflare_zone', 'Cloudflare zone', 'fail', 'Zone not found in Cloudflare');
  }
}

function checkNsDelegation(registrarStep, zoneData) {
  if (!zoneData) return step('ns_delegation', 'NS delegation', 'skip', 'No zone data');
  const cfNs = (zoneData.name_servers || []).map((n) => n.toLowerCase()).sort();
  const regNs = (registrarStep?.nameservers || []).map((n) => n.toLowerCase()).sort();

  if (regNs.length === 0) {
    return zoneData.status === 'active'
      ? step('ns_delegation', 'NS delegation', 'pass', 'Confirmed by active zone status')
      : step('ns_delegation', 'NS delegation', 'skip', 'Registrar NS not available for comparison');
  }
  const match = cfNs.length > 0 && cfNs.length === regNs.length && cfNs.every((ns, i) => ns === regNs[i]);
  return match
    ? step('ns_delegation', 'NS delegation', 'pass', cfNs.join(', '))
    : step('ns_delegation', 'NS delegation', 'fail',
        `Mismatch — registrar: ${regNs.join(', ')} | CF: ${cfNs.join(', ')}`);
}

function checkActivation(zoneData) {
  if (!zoneData) return step('zone_activation', 'Zone activation', 'skip', 'No zone');
  return zoneData.status === 'active'
    ? step('zone_activation', 'Zone activation', 'pass', 'Active')
    : step('zone_activation', 'Zone activation', 'wait',
        `Status: ${zoneData.status} — propagation in progress`, { gate: true });
}

async function checkEmailMx(cfToken, zoneData, spFlag = '<path>') {
  if (!zoneData?.id) return step('email_mx', 'Email / MX on CF', 'skip', 'No zone');
  try {
    const records = await listAllDnsRecords(cfToken, zoneData.id);
    const email = auditEmailDns(records, zoneData.name);
    if (apexHasMx(records, zoneData.name) || email.hasMx) {
      return step(
        'email_mx',
        'Email / MX on CF',
        'pass',
        `${email.mailProviderGuess} | MX yes | SPF ${email.hasSpf ? 'yes' : 'no'} | DMARC ${email.hasDmarc ? 'yes' : 'no'}`,
        { email }
      );
    }
    return step(
      'email_mx',
      'Email / MX on CF',
      'fail',
      'No apex MX on Cloudflare — fix before ns update --apply (or use --allow-missing-email)',
      {
        email,
        nextCommand: `node cloudflare-agent-toolkit/bin/cf-agent.mjs email audit --site-profile ${spFlag}`
      }
    );
  } catch (err) {
    return step('email_mx', 'Email / MX on CF', 'fail', `Error: ${err.message}`);
  }
}

async function checkDnsRecords(cfToken, zoneData, expectedRecords) {
  if (expectedRecords.length === 0) return step('dns_records', 'DNS records', 'skip', 'No expected records');
  let live = [];
  try {
    live = await listAllDnsRecords(cfToken, zoneData.id);
  } catch {
    const res = await safeCloudflareRequest(cfToken, `/zones/${zoneData.id}/dns_records?per_page=200`);
    live = res.ok ? (res.payload?.result || []) : [];
  }
  const found = expectedRecords.filter((exp) =>
    live.some((l) => l.name.toLowerCase() === exp.name.toLowerCase() && l.type === exp.type)
  );
  return found.length === expectedRecords.length
    ? step('dns_records', 'DNS records', 'pass', `${found.length}/${expectedRecords.length} records present`)
    : step('dns_records', 'DNS records', 'fail', `${found.length}/${expectedRecords.length} records found`);
}

async function checkPagesDomains(cfToken, accountId, profile) {
  const project = String(profile?.cloudflare?.pagesProject || '').trim();
  if (!project) return step('pages_domains', 'Pages custom domains', 'skip', 'No pagesProject in profile');
  if (!accountId) return step('pages_domains', 'Pages custom domains', 'fail', 'Missing CLOUDFLARE_ACCOUNT_ID');
  const res = await safeCloudflareRequest(cfToken, `/accounts/${accountId}/pages/projects/${project}/domains`);
  if (!res.ok) return step('pages_domains', 'Pages custom domains', 'fail', `Project "${project}" not accessible`);
  const attached = (res.payload?.result || []).map((d) => (d.domain || d.name || '').toLowerCase());
  const hosts = (profile?.hosts?.production || []).map((h) => h.toLowerCase());
  const missing = hosts.filter((h) => !attached.includes(h));
  return missing.length === 0 && hosts.length > 0
    ? step('pages_domains', 'Pages custom domains', 'pass', `${hosts.length} domain(s) attached`)
    : step('pages_domains', 'Pages custom domains', 'fail', `Missing: ${missing.join(', ') || 'none configured'}`);
}

async function checkDeployment(cfToken, accountId, profile) {
  const project = String(profile?.cloudflare?.pagesProject || '').trim();
  if (!project || !accountId) return step('deployment', 'Site deployment', 'skip', 'No Pages project');
  const res = await safeCloudflareRequest(cfToken, `/accounts/${accountId}/pages/projects/${project}`);
  if (!res.ok) return step('deployment', 'Site deployment', 'fail', 'Pages project not found');
  const dep = res.payload?.result?.latest_deployment;
  return dep
    ? step('deployment', 'Site deployment', 'pass', `${dep.environment || 'production'} — ${(dep.created_on || '').slice(0, 10)}`)
    : step('deployment', 'Site deployment', 'fail', 'No deployments yet');
}

async function checkRedirectRules(cfToken, zoneData, domain, redirectTarget) {
  const res = await safeCloudflareRequest(cfToken,
    `/zones/${zoneData.id}/rulesets/phases/http_request_dynamic_redirect/entrypoint`);
  if (!res.ok) return step('redirect_rules', 'Redirect rules', 'fail', 'No redirect ruleset configured');
  const rules = res.payload?.result?.rules || [];
  const has = rules.some((r) => r.action === 'redirect' && r.expression?.includes(domain));
  return has
    ? step('redirect_rules', 'Redirect rules', 'pass', `→ ${redirectTarget}`)
    : step('redirect_rules', 'Redirect rules', 'fail', `No redirect rule for ${domain}`);
}

async function checkHardening(cfToken, zoneData) {
  const [ssl, https, tls] = await Promise.all([
    safeCloudflareRequest(cfToken, `/zones/${zoneData.id}/settings/ssl`),
    safeCloudflareRequest(cfToken, `/zones/${zoneData.id}/settings/always_use_https`),
    safeCloudflareRequest(cfToken, `/zones/${zoneData.id}/settings/min_tls_version`)
  ]);
  const sslVal = ssl.ok ? ssl.payload?.result?.value : null;
  const httpsVal = https.ok ? https.payload?.result?.value : null;
  const tlsVal = tls.ok ? tls.payload?.result?.value : null;
  const ok = (sslVal === 'full' || sslVal === 'strict') && httpsVal === 'on' && (tlsVal === '1.2' || tlsVal === '1.3');
  const detail = `SSL: ${sslVal || '?'} | HTTPS: ${httpsVal || '?'} | TLS min: ${tlsVal || '?'}`;
  return ok
    ? step('zone_hardening', 'Zone hardening', 'pass', detail)
    : step('zone_hardening', 'Zone hardening', 'fail', detail);
}

// ── Main pipeline runner ──

/**
 * Run the full migration pipeline status check.
 *
 * @param {Object} opts
 * @param {string} opts.domain - Zone/domain name
 * @param {Object} opts.profile - Parsed site profile
 * @param {Object} opts.env - Merged environment
 * @param {Object|null} opts.porkbunCreds - { apiKey, secretKey } or null
 * @param {string} opts.siteProfileFlag - Original --site-profile flag value for command hints
 * @returns {{ steps, gated, gateReason, nextAction, summary }}
 */
export async function checkMigrationPipeline(opts) {
  const { domain, profile, env, porkbunCreds, siteProfileFlag } = opts;
  const isRedirect = Boolean(profile?.cloudflare?.redirectTarget);
  const redirectTarget = String(profile?.cloudflare?.redirectTarget || '').trim();
  const expectedRecords = deriveExpectedRecords(profile);
  const spFlag = siteProfileFlag || `site-profiles/${profile?.siteId || 'unknown'}.json`;

  const steps = [];
  let gated = false;
  let gateReason = '';
  let zoneData = null;
  let cfToken = null;

  try {
    const cf = resolveCloudflareCredential(env, { allowWranglerOauth: true });
    cfToken = cf.token;
  } catch { /* no CF cred */ }

  // 1. Registrar
  const regStep = await checkRegistrar(domain, porkbunCreds);
  steps.push(regStep);

  // 2. Cloudflare zone
  const zoneStep = await checkZone(domain, cfToken);
  steps.push(zoneStep);
  zoneData = zoneStep.zone || null;
  if (zoneStep.status === 'fail') { gated = true; gateReason = 'Zone must be created first'; }

  // 2b. Email / MX on Cloudflare (before recommending ns update)
  if (zoneData && cfToken) {
    steps.push(await checkEmailMx(cfToken, zoneData, spFlag));
  }

  // 3. NS delegation
  if (!gated) {
    const nsStep = checkNsDelegation(regStep, zoneData);
    steps.push(nsStep);
    if (nsStep.status === 'fail') { gated = true; gateReason = 'NS must be delegated to Cloudflare'; }
  }

  // 4. Zone activation — GATE
  if (!gated && zoneData) {
    const actStep = checkActivation(zoneData);
    steps.push(actStep);
    if (actStep.status !== 'pass') { gated = true; gateReason = `Zone status: ${zoneData.status}`; }
  }

  // Fill skipped steps if gated
  if (gated) {
    const remaining = isRedirect
      ? ['dns_records', 'redirect_rules', 'zone_hardening']
      : ['dns_records', 'pages_domains', 'deployment', 'zone_hardening'];
    const labels = {
      dns_records: 'DNS records', pages_domains: 'Pages custom domains',
      deployment: 'Site deployment', redirect_rules: 'Redirect rules', zone_hardening: 'Zone hardening'
    };
    for (const id of remaining) {
      if (!steps.some((s) => s.id === id)) {
        steps.push(step(id, labels[id] || id, 'skip', `Blocked: ${gateReason}`));
      }
    }
  }

  // Post-gate checks
  if (!gated && zoneData && cfToken) {
    const accountId = resolveAccountId(profile, env, zoneData);

    // 5. DNS records
    steps.push(await checkDnsRecords(cfToken, zoneData, expectedRecords));

    if (isRedirect) {
      // 6. Redirect rules
      steps.push(await checkRedirectRules(cfToken, zoneData, domain, redirectTarget));
    } else {
      // 6. Pages custom domains
      steps.push(await checkPagesDomains(cfToken, accountId, profile));
      // 7. Deployment
      steps.push(await checkDeployment(cfToken, accountId, profile));
    }

    // N. Hardening
    steps.push(await checkHardening(cfToken, zoneData));
  }

  // Derive next action
  const firstFail = steps.find((s) => s.status === 'fail');
  const firstWait = steps.find((s) => s.status === 'wait');
  const passed = steps.filter((s) => s.status === 'pass').length;
  const total = steps.length;

  let nextAction = null;
  if (firstFail) {
    const cmd = firstFail.nextCommand || deriveNextCommand(firstFail, spFlag, profile, isRedirect);
    nextAction = { type: 'action', step: firstFail.id, description: firstFail.detail, command: cmd };
  } else if (firstWait) {
    nextAction = {
      type: 'wait',
      step: firstWait.id,
      description: firstWait.detail,
      command: `node registrar/registrar.mjs status --site-profile ${spFlag}`
    };
  } else {
    nextAction = { type: 'complete', description: 'All pipeline steps passed.' };
  }

  return {
    domain,
    profile: profile?.siteId || 'unknown',
    type: isRedirect ? 'redirect' : 'content',
    steps,
    gated,
    gateReason,
    passed,
    total,
    nextAction
  };
}

function deriveNextCommand(failStep, spFlag, profile, _isRedirect) {
  const map = {
    cloudflare_zone: `node registrar/registrar.mjs zone ensure --site-profile ${spFlag} --apply`,
    ns_delegation: `node registrar/registrar.mjs ns update --site-profile ${spFlag} --apply`,
    dns_records: `node cloudflare-agent-toolkit/bin/cf-agent.mjs dns fix --site-profile ${spFlag} --apply`,
    pages_domains: `node cloudflare-agent-toolkit/bin/cf-agent.mjs pages setup --site-profile ${spFlag}`,
    deployment: profile?.commands?.deploy?.production || `npx wrangler pages deploy dist --project-name=${profile?.cloudflare?.pagesProject || '<project>'}`,
    redirect_rules: `node registrar/registrar.mjs redirect --site-profile ${spFlag} --apply`,
    zone_hardening: `node cloudflare-agent-toolkit/bin/cf-agent.mjs site harden --site-profile ${spFlag} --apply`
  };
  return map[failStep.id] || 'See report for details';
}

