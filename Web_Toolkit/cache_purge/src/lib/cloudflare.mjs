// ./Web_Toolkit/cache_purge/src/lib/cloudflare.mjs
/**
 * Minimal Cloudflare purge client: zone lookup plus batched `purge_cache` calls.
 *
 * Used by: cache_purge/src/commands/purge.mjs (and unit tests).
 * Inputs: API token, zone name, purge key (`files` | `prefixes` | `hosts`), items, batch size.
 * Outputs: a submit summary, or a CloudflarePurgeError that says how much succeeded.
 * Side effects: HTTPS requests to api.cloudflare.com.
 * Notes: `fetchImpl` and `sleep` are injectable so tests never touch the network.
 * Cloudflare rate-limits purges (Free: 5 requests/minute), so HTTP 429 is retried
 * after the advertised delay instead of failing the whole run.
 */

import { chunk } from './urls.mjs';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const DEFAULT_RETRY_DELAY_MS = 13_000;
const MAX_RETRY_DELAY_MS = 65_000;

export class CloudflarePurgeError extends Error {
  constructor(message, { submitted = 0, remaining = 0, status = 0, details } = {}) {
    super(message);
    this.name = 'CloudflarePurgeError';
    this.submitted = submitted;
    this.remaining = remaining;
    this.status = status;
    this.details = details;
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

function describeErrors(payload) {
  const errors = payload?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map((entry) => `${entry.code ?? '?'}: ${entry.message ?? 'unknown error'}`).join('; ');
  }
  return 'no error details returned';
}

function retryDelayMs(response, attempt) {
  const header = Number(response.headers?.get?.('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, MAX_RETRY_DELAY_MS);
  return Math.min(DEFAULT_RETRY_DELAY_MS * attempt, MAX_RETRY_DELAY_MS);
}

/** Look up the zone id for a zone name. Throws instead of silently skipping, so scripts see a failure. */
export async function resolveZoneId({ token, zoneName, fetchImpl = globalThis.fetch }) {
  const url = `${API_BASE}/zones?name=${encodeURIComponent(zoneName)}&per_page=50`;
  let response;
  try {
    response = await fetchImpl(url, { headers: authHeaders(token) });
  } catch (error) {
    throw new Error(`Zone lookup failed for "${zoneName}": ${error instanceof Error ? error.message : String(error)}`);
  }
  const payload = await response.json().catch(() => ({}));
  const zone = Array.isArray(payload?.result) ? payload.result[0] : null;
  if (!response.ok || !zone?.id) {
    throw new Error(`Unable to resolve zone "${zoneName}" (${describeErrors(payload)}). Check CLOUDFLARE_API_TOKEN scope and the profile zone name.`);
  }
  return zone.id;
}

async function submitBatch({ token, zoneId, body, fetchImpl, sleep, log, maxRetries, context }) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetchImpl(`${API_BASE}/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body)
    });
    if (response.status === 429 && attempt <= maxRetries) {
      const delay = retryDelayMs(response, attempt);
      log(`  rate limited; retrying in ${Math.ceil(delay / 1000)}s (attempt ${attempt} of ${maxRetries})`);
      await sleep(delay);
      continue;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw new CloudflarePurgeError(`Cloudflare purge rejected (HTTP ${response.status}): ${describeErrors(payload)}`, {
        ...context,
        status: response.status,
        details: payload?.errors
      });
    }
    return payload;
  }
}

/**
 * Submit `items` under `key` in batches of `batchSize`, stopping at the first failure.
 * Returns `{ batches, submitted }`; failures throw CloudflarePurgeError with progress counts.
 */
export async function purgeInBatches({
  token,
  zoneId,
  key,
  items,
  batchSize,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  log = () => {},
  maxRetries = 3
}) {
  const groups = chunk(items, batchSize);

  let submitted = 0;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const context = { submitted, remaining: items.length - submitted };
    await submitBatch({
      token,
      zoneId,
      body: { [key]: group },
      fetchImpl,
      sleep,
      log,
      maxRetries,
      context
    });
    submitted += group.length;
    log(`- Batch ${index + 1}/${groups.length}: ${group.length} ${key} purged`);
  }
  return { batches: groups.length, submitted };
}

/** Submit a single non-list purge body (`purge_everything`). */
export async function purgeBody({ token, zoneId, body, fetchImpl = globalThis.fetch, sleep = defaultSleep, log = () => {}, maxRetries = 3 }) {
  await submitBatch({ token, zoneId, body, fetchImpl, sleep, log, maxRetries, context: { submitted: 0, remaining: 1 } });
  return { batches: 1, submitted: 1 };
}
