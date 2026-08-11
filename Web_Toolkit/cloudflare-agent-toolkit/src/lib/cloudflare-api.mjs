// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/cloudflare-api.mjs
/**
 * Cloudflare REST/GraphQL request helpers.
 *
 * Provides authenticated API wrappers for token verification, zone discovery,
 * settings reads/writes, route/dns fetches, and 24h request analytics.
 */

function apiErrorMessage(payload, fallback) {
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    return payload.errors
      .map((entry) => `${entry.code ?? 'unknown'}:${entry.message ?? 'unknown error'}`)
      .join('; ');
  }
  return fallback;
}

export async function cloudflareRequest(token, endpoint, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: init.body ? JSON.stringify(init.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`${endpoint} failed: ${apiErrorMessage(payload, `${response.status} ${response.statusText}`)}`);
  }
  return payload;
}

export async function safeCloudflareRequest(token, endpoint, init = {}) {
  try {
    const payload = await cloudflareRequest(token, endpoint, init);
    return { ok: true, payload, endpoint };
  } catch (error) {
    return { ok: false, endpoint, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function graphqlRequest(token, query, variables = {}) {
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (Array.isArray(payload?.errors) && payload.errors.length > 0)) {
    const message = Array.isArray(payload?.errors) && payload.errors.length > 0
      ? payload.errors.map((entry) => String(entry?.message || 'unknown error')).join('; ')
      : `${response.status} ${response.statusText}`;
    throw new Error(`graphql failed: ${message}`);
  }
  return payload;
}

export async function verifyToken(token) {
  return cloudflareRequest(token, '/user/tokens/verify');
}

export async function tokenDetails(token, tokenId) {
  return cloudflareRequest(token, `/user/tokens/${tokenId}`);
}

export async function resolveZoneByName(token, zoneName) {
  const payload = await cloudflareRequest(token, `/zones?name=${encodeURIComponent(zoneName)}&per_page=50`);
  const zones = Array.isArray(payload?.result) ? payload.result : [];
  if (zones.length === 0) {
    throw new Error(`No zone found for "${zoneName}".`);
  }
  return zones[0];
}

export async function fetch24hHttpAnalytics(token, zoneId, sinceIso, untilIso) {
  const query = `
    query($zoneTag: string, $from: Time!, $to: Time!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1hGroups(limit: 72, filter: { datetime_geq: $from, datetime_leq: $to }) {
            dimensions { datetime }
            sum { requests cachedRequests threats }
            uniq { uniques }
          }
        }
      }
    }
  `;
  const payload = await graphqlRequest(token, query, { zoneTag: zoneId, from: sinceIso, to: untilIso });
  const groups = payload?.data?.viewer?.zones?.[0]?.httpRequests1hGroups;
  const entries = Array.isArray(groups) ? groups : [];
  return entries.reduce(
    (acc, entry) => ({
      requestsAll: acc.requestsAll + Number(entry?.sum?.requests || 0),
      requestsCached: acc.requestsCached + Number(entry?.sum?.cachedRequests || 0),
      threatsAll: acc.threatsAll + Number(entry?.sum?.threats || 0),
      uniquesHourSum: acc.uniquesHourSum + Number(entry?.uniq?.uniques || 0),
      bucketCount: acc.bucketCount + 1
    }),
    { requestsAll: 0, requestsCached: 0, threatsAll: 0, uniquesHourSum: 0, bucketCount: 0 }
  );
}

export async function listWorkerScripts(token, accountId) {
  const payload = await cloudflareRequest(token, `/accounts/${accountId}/workers/scripts`);
  return Array.isArray(payload?.result) ? payload.result : [];
}

export async function listPagesProjects(token, accountId) {
  const payload = await cloudflareRequest(token, `/accounts/${accountId}/pages/projects`);
  return Array.isArray(payload?.result) ? payload.result : [];
}

export async function getPagesProject(token, accountId, projectName) {
  return cloudflareRequest(token, `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}`);
}

export async function listPagesCustomDomains(token, accountId, projectName) {
  const payload = await cloudflareRequest(token, `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/domains`);
  return Array.isArray(payload?.result) ? payload.result : [];
}

export async function addPagesCustomDomain(token, accountId, projectName, domain) {
  return cloudflareRequest(
    token,
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/domains`,
    { method: 'POST', body: { name: domain } }
  );
}

export async function deleteDnsRecord(token, zoneId, recordId) {
  return cloudflareRequest(
    token,
    `/zones/${zoneId}/dns_records/${recordId}`,
    { method: 'DELETE' }
  );
}

export async function updateDnsRecord(token, zoneId, recordId, body) {
  return cloudflareRequest(
    token,
    `/zones/${zoneId}/dns_records/${recordId}`,
    { method: 'PATCH', body }
  );
}

/**
 * Paginate all DNS records for a zone (Cloudflare caps per_page at 5000; we use 200 pages).
 * @param {string} token
 * @param {string} zoneId
 * @param {{ type?: string }} [query]
 */
export async function listAllDnsRecords(token, zoneId, query = {}) {
  const records = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage)
    });
    if (query.type) params.set('type', String(query.type));
    const payload = await cloudflareRequest(token, `/zones/${zoneId}/dns_records?${params}`);
    const batch = Array.isArray(payload?.result) ? payload.result : [];
    records.push(...batch);
    const totalPages = Number(payload?.result_info?.total_pages || 1);
    if (page >= totalPages || batch.length === 0) break;
    page += 1;
  }
  return records;
}

