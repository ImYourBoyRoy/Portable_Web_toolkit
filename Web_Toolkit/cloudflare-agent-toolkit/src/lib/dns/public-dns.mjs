// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/dns/public-dns.mjs
/**
 * Public/local DNS resolution helpers for propagation audits.
 */

import dns from 'node:dns/promises';

async function doh(provider, url, name, type) {
  const response = await fetch(`${url}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`, {
    headers: { accept: 'application/dns-json' }
  });
  const payload = await response.json();
  const answers = Array.isArray(payload?.Answer) ? payload.Answer : [];
  return {
    provider,
    type,
    values: answers.map((entry) => String(entry.data || '')).sort()
  };
}

async function localResolve(name, type) {
  try {
    let values = [];
    if (type === 'A') values = await dns.resolve4(name);
    if (type === 'AAAA') values = await dns.resolve6(name);
    if (type === 'CNAME') values = await dns.resolveCname(name);
    if (type === 'MX') values = (await dns.resolveMx(name)).map((entry) => `${entry.priority}:${entry.exchange}`);
    if (type === 'TXT') values = (await dns.resolveTxt(name)).map((parts) => parts.join(''));
    return { provider: 'local', type, values: values.map(String).sort() };
  } catch (error) {
    return { provider: 'local', type, values: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function resolveDnsAcrossResolvers(name, types = ['A', 'AAAA', 'CNAME']) {
  const checks = [];
  for (const type of types) {
    const [cloudflare, google, local] = await Promise.all([
      doh('cloudflare-doh', 'https://cloudflare-dns.com/dns-query', name, type).catch((error) => ({ provider: 'cloudflare-doh', type, values: [], error: String(error) })),
      doh('google-doh', 'https://dns.google/resolve', name, type).catch((error) => ({ provider: 'google-doh', type, values: [], error: String(error) })),
      localResolve(name, type)
    ]);
    checks.push({ type, resolvers: [cloudflare, google, local] });
  }
  return checks;
}

