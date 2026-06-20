// ./Web_Toolkit/registrar/porkbun-api.mjs
/**
 * Porkbun REST API v3 client for domain and nameserver management.
 *
 * Endpoints used:
 *   POST /ping                        — verify credentials + get caller IP
 *   POST /domain/listAll              — list all domains in the account
 *   POST /domain/getNs/{domain}       — get current nameservers
 *   POST /domain/updateNs/{domain}    — set nameservers
 *
 * Auth model: every request body includes { apikey, secretapikey }.
 *
 * API docs: https://porkbun.com/api/json/v3/documentation
 */

const PORKBUN_API_BASE = 'https://api.porkbun.com/api/json/v3';

function authBody(apiKey, secretKey) {
  return { apikey: apiKey, secretapikey: secretKey };
}

async function porkbunRequest(endpoint, body = {}) {
  const url = `${PORKBUN_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (response.status === 429) {
    const ttl = payload?.ttlRemaining || 'unknown';
    throw new Error(`Porkbun rate limit exceeded (retry in ${ttl}s). Endpoint: ${endpoint}`);
  }

  if (!response.ok || payload?.status === 'ERROR') {
    const code = payload?.code || '';
    const message = payload?.message || `${response.status} ${response.statusText}`;
    throw new Error(`Porkbun ${endpoint}: ${code ? `[${code}] ` : ''}${message}`);
  }

  return payload;
}

async function safePorkbunRequest(endpoint, body = {}) {
  try {
    const payload = await porkbunRequest(endpoint, body);
    return { ok: true, payload, endpoint };
  } catch (error) {
    return { ok: false, endpoint, error: error instanceof Error ? error.message : String(error) };
  }
}

// ── Public API ──

/**
 * Ping credentials. Returns { ok, ip, credentialsValid } or throws.
 */
export async function porkbunPing(apiKey, secretKey) {
  const payload = await porkbunRequest('/ping', authBody(apiKey, secretKey));
  return {
    ok: true,
    ip: payload.yourIp || '',
    credentialsValid: payload.credentialsValid === true || payload.status === 'SUCCESS'
  };
}

/**
 * Safe version of ping — returns result object instead of throwing.
 */
export async function safePorkbunPing(apiKey, secretKey) {
  return safePorkbunRequest('/ping', authBody(apiKey, secretKey));
}

/**
 * List all domains in the account. Handles pagination automatically.
 * Returns array of domain objects.
 */
export async function porkbunListDomains(apiKey, secretKey) {
  const allDomains = [];
  let start = 0;

  while (true) {
    const payload = await porkbunRequest('/domain/listAll', {
      ...authBody(apiKey, secretKey),
      start,
      includeLabels: 'yes'
    });
    const domains = Array.isArray(payload.domains) ? payload.domains : [];
    allDomains.push(...domains);

    // Porkbun returns up to 1000 per page; if fewer, we're done.
    if (domains.length < 1000) break;
    start += 1000;
  }

  return allDomains;
}

/**
 * Get current nameservers for a domain.
 * Returns array of NS hostname strings.
 */
export async function porkbunGetNs(apiKey, secretKey, domain) {
  const payload = await porkbunRequest(
    `/domain/getNs/${encodeURIComponent(domain)}`,
    authBody(apiKey, secretKey)
  );
  return Array.isArray(payload.ns) ? payload.ns : [];
}

/**
 * Update nameservers for a domain.
 * @param {string[]} nameservers - ordered array of NS hostnames
 */
export async function porkbunUpdateNs(apiKey, secretKey, domain, nameservers) {
  return porkbunRequest(
    `/domain/updateNs/${encodeURIComponent(domain)}`,
    { ...authBody(apiKey, secretKey), ns: nameservers }
  );
}

/**
 * Check if a specific domain has API access enabled.
 * Attempts a lightweight read operation (getNs) to detect permission.
 */
export async function porkbunCheckDomainAccess(apiKey, secretKey, domain) {
  const result = await safePorkbunRequest(
    `/domain/getNs/${encodeURIComponent(domain)}`,
    authBody(apiKey, secretKey)
  );
  return {
    domain,
    hasAccess: result.ok,
    nameservers: result.ok ? (Array.isArray(result.payload.ns) ? result.payload.ns : []) : [],
    error: result.ok ? null : result.error
  };
}

/**
 * Retrieve all editable DNS records for a domain from Porkbun.
 */
export async function porkbunGetDnsRecords(apiKey, secretKey, domain) {
  const payload = await porkbunRequest(
    `/dns/retrieve/${encodeURIComponent(domain)}`,
    authBody(apiKey, secretKey)
  );
  return Array.isArray(payload.records) ? payload.records : [];
}

