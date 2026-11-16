// ./Web_Toolkit/package_updater/src/lib/registry.mjs
/**
 * npm registry access for the toolchain resolver: abbreviated package documents (small; they carry the per-version
 * peerDependencies/dependencies the resolver needs), cached per process. Honors npm_config_registry.
 */

import { isStable, parse } from '../../../shared/lib/semver-lite.mjs';

const ACCEPT = 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

export function registryBase(env = process.env) {
  return String(env.npm_config_registry || env.NPM_CONFIG_REGISTRY || DEFAULT_REGISTRY).replace(/\/$/, '');
}

/** @returns {Promise<{ name: string, latest: string | null, versions: Map<string, object> }>} stable versions only */
export async function fetchPackument(name, { fetchImpl = globalThis.fetch, registry = registryBase(), timeoutMs = 30_000, cache } = {}) {
  if (cache?.has(name)) return cache.get(name);
  const response = await fetchImpl(`${registry}/${name.replace('/', '%2F')}`, {
    headers: { accept: ACCEPT, 'user-agent': 'portable-web-toolkit-package-updater' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`${name}: registry returned HTTP ${response.status}`);
  const document = await response.json();
  const versions = new Map();
  for (const [version, meta] of Object.entries(document.versions ?? {})) {
    if (!isStable(parse(version) ?? { pre: ['x'] })) continue;
    versions.set(version, {
      peerDependencies: meta.peerDependencies ?? {},
      dependencies: meta.dependencies ?? {},
      engines: meta.engines ?? {},
      deprecated: Boolean(meta.deprecated)
    });
  }
  const result = { name, latest: document['dist-tags']?.latest ?? null, versions, modified: document.modified ?? null };
  cache?.set(name, result);
  return result;
}

/**
 * Marks versions published inside the release-age window `tooNew` (with publishedAt) so the resolver never writes a range
 * pnpm 12 (minimumReleaseAge, default 24h) or a supply-chain-minded team would refuse. The abbreviated document has no
 * per-version times, so the full document is fetched only for packages modified inside the window.
 */
export async function applyReleaseAge(packument, minimumAgeMs, { fetchImpl = globalThis.fetch, registry = registryBase(), now = Date.now(), timeoutMs = 60_000 } = {}) {
  if (!minimumAgeMs || minimumAgeMs <= 0 || packument.error) return packument;
  const cutoff = now - minimumAgeMs;
  const modified = Date.parse(packument.modified ?? '');
  if (Number.isFinite(modified) && modified <= cutoff) return packument;
  const response = await fetchImpl(`${registry}/${packument.name.replace('/', '%2F')}`, { headers: { accept: 'application/json', 'user-agent': 'portable-web-toolkit-package-updater' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${packument.name}: release times unavailable (HTTP ${response.status})`);
  const times = (await response.json()).time ?? {};
  for (const [version, meta] of packument.versions) {
    const published = Date.parse(times[version] ?? '');
    if (Number.isFinite(published) && published > cutoff) {
      meta.tooNew = true;
      meta.publishedAt = new Date(published).toISOString();
    }
  }
  return packument;
}

export async function fetchPackuments(names, options = {}) {
  const cache = options.cache ?? new Map();
  const entries = await Promise.all(names.map(async (name) => {
    try {
      const packument = await fetchPackument(name, { ...options, cache });
      return [name, options.minimumAgeMs ? await applyReleaseAge(packument, options.minimumAgeMs, options) : packument];
    } catch (error) {
      return [name, { error: error.message }];
    }
  }));
  return Object.fromEntries(entries);
}
