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
  const response = await fetch(url, options.fetchOptions || {});
  const body = await response.text();
  return {
    ok: response.status >= 200 && response.status < 400,
    status: response.status,
    body,
    url: url.href
  };
}
