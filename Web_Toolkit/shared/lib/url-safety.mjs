// ./Web_Toolkit/shared/lib/url-safety.mjs
/**
 * Guardrails for operator-controlled HTTP fetch helpers.
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

function isBlockedIpv4(hostname) {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  if (a >= 224) return true;
  return false;
}

export function assertPublicHttpUrl(input, label = 'URL') {
  const raw = String(input || '').trim();
  if (!raw) throw new Error(`Missing ${label}.`);

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid ${label}: ${raw}`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must use http or https.`);
  }

  const hostname = url.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (!hostname) throw new Error(`${label} is missing a hostname.`);

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local')) {
    throw new Error(`${label} must not target localhost or local-only hosts.`);
  }

  if (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) {
    throw new Error(`${label} must not target loopback or link-local addresses.`);
  }

  if (isBlockedIpv4(hostname)) {
    throw new Error(`${label} must not target private, loopback, or reserved IPv4 addresses.`);
  }

  return url;
}

export async function fetchPublicText(urlInput, options = {}) {
  const url = assertPublicHttpUrl(urlInput, options.label || 'URL');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs || 15000);
  const maxBytes = Number(options.maxBytes || 8 * 1024 * 1024);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      ...(options.fetchOptions || {}),
      signal: options.fetchOptions?.signal || controller.signal,
    });
    const declaredLength = Number(response.headers?.get?.('content-length') || 0);
    if (declaredLength > maxBytes) throw new Error(`${options.label || 'Response'} exceeds ${maxBytes} bytes.`);
    let body;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error(`${options.label || 'Response'} exceeds ${maxBytes} bytes.`);
        }
        chunks.push(value);
      }
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      body = new TextDecoder().decode(merged);
    } else {
      body = await response.text();
      if (new TextEncoder().encode(body).byteLength > maxBytes) {
        throw new Error(`${options.label || 'Response'} exceeds ${maxBytes} bytes.`);
      }
    }
    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      body,
      url: response.url || url.href,
      headers: Object.fromEntries(response.headers?.entries?.() || []),
      redirected: Boolean(response.redirected),
    };
  } finally {
    clearTimeout(timeout);
  }
}
