/**
 * Discovery Doctor policy resolution.
 *
 * The toolkit treats its core discovery artifacts as the default release
 * contract. A site profile may explicitly relax one of those requirements or
 * add stricter public endpoint requirements. An explicitly relaxed resource
 * remains validated when present, so absence and invalid content stay
 * distinguishable.
 */

export const DEFAULT_SITEMAP_CANDIDATES = ['/sitemap.xml', '/sitemap-index.xml'];

const DEFAULT_ENDPOINTS = [
  {
    path: '/api/content.json',
    label: 'Structured Content API',
    format: 'json',
    method: 'GET',
    runtimeOnly: false,
    requiredKey: 'contentApi',
  },
  {
    path: '/api/search.json?q=test',
    label: 'Dynamic Search API',
    format: 'json',
    method: 'GET',
    runtimeOnly: true,
    requiredKey: 'searchApi',
  },
];

export const DEFAULT_DISCOVERY_POLICY = Object.freeze({
  environment: 'production',
  required: Object.freeze({
    robots: true,
    sitemap: true,
    llms: true,
    llmsFull: true,
    contentApi: true,
    searchApi: false,
    humans: true,
    securityTxt: true,
    headers: true,
    jsonLd: true,
  }),
  sitemapCandidates: DEFAULT_SITEMAP_CANDIDATES,
  endpoints: DEFAULT_ENDPOINTS,
  checkLinks: true,
  maxLinks: 40,
  timeoutMs: 10000,
  mcpProtocolVersion: '2026-07-28',
});

function asBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function normalizeEndpoint(endpoint, required = false) {
  if (!endpoint || typeof endpoint !== 'object') return null;
  const endpointPath = normalizePath(endpoint.path);
  const format = String(endpoint.format || 'text').trim().toLowerCase();
  if (!endpointPath) return null;
  const method = String(endpoint.method || (format === 'mcp' ? 'POST' : 'GET')).trim().toUpperCase();
  return {
    path: endpointPath,
    label: String(endpoint.label || endpointPath),
    method: ['GET', 'POST', 'HEAD'].includes(method) ? method : 'GET',
    format,
    required: asBoolean(endpoint.required, required),
    runtimeOnly: Boolean(endpoint.runtimeOnly ?? endpoint.ssrOk),
    checkLinks: asBoolean(endpoint.checkLinks, true),
    schema: endpoint.schema ? String(endpoint.schema) : '',
    protocolVersion: endpoint.protocolVersion ? String(endpoint.protocolVersion) : '',
  };
}

function profileDiscovery(profile = {}) {
  return profile?.discovery || profile?.diagnostics?.discovery || {};
}

/**
 * Resolve a profile/config object into a normalized, serializable policy.
 * `config` may be the discovery object itself, a full site profile, or an
 * object containing a `discovery` property.
 */
export function createDiscoveryPolicy(config = {}, overrides = {}) {
  const discovery = config?.discovery || config?.diagnostics?.discovery
    ? profileDiscovery(config)
    : (config && typeof config === 'object' ? config : {});
  const requiredConfig = discovery.required && typeof discovery.required === 'object'
    ? discovery.required
    : {};
  const environment = String(overrides.environment || discovery.environment || DEFAULT_DISCOVERY_POLICY.environment)
    .trim().toLowerCase() === 'development' ? 'development' : 'production';

  const required = {
    ...DEFAULT_DISCOVERY_POLICY.required,
    ...Object.fromEntries(Object.entries(requiredConfig).filter(([, value]) => typeof value === 'boolean')),
  };
  if (environment !== 'production' && !Object.prototype.hasOwnProperty.call(requiredConfig, 'sitemap')) {
    required.sitemap = false;
  }
  if (environment !== 'production' && !Object.prototype.hasOwnProperty.call(requiredConfig, 'securityTxt')) {
    required.securityTxt = false;
  }
  if (overrides.requireLlms) required.llms = true;
  if (overrides.requireLlmsFull) required.llmsFull = true;

  const endpointSource = Array.isArray(discovery.endpoints)
    ? discovery.endpoints
    : DEFAULT_DISCOVERY_POLICY.endpoints;
  const endpoints = endpointSource
    .map((endpoint) => normalizeEndpoint(
      endpoint,
      endpoint?.requiredKey ? asBoolean(required[endpoint.requiredKey], false) : false,
    ))
    .filter(Boolean);

  const sitemapCandidates = (Array.isArray(discovery.sitemapCandidates)
    ? discovery.sitemapCandidates
    : DEFAULT_DISCOVERY_POLICY.sitemapCandidates)
    .map(normalizePath)
    .filter((value, index, values) => value && values.indexOf(value) === index);

  const maxLinks = Number(discovery.maxLinks ?? DEFAULT_DISCOVERY_POLICY.maxLinks);
  const timeoutMs = Number(discovery.timeoutMs ?? DEFAULT_DISCOVERY_POLICY.timeoutMs);
  const privatePathSegments = Array.isArray(discovery.privatePathSegments)
    ? discovery.privatePathSegments.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : undefined;

  return {
    ...DEFAULT_DISCOVERY_POLICY,
    ...discovery,
    environment,
    required,
    sitemapCandidates: sitemapCandidates.length ? sitemapCandidates : DEFAULT_SITEMAP_CANDIDATES,
    endpoints,
    checkLinks: asBoolean(overrides.checkLinks, asBoolean(discovery.checkLinks, true)),
    maxLinks: Number.isFinite(maxLinks) && maxLinks > 0 ? Math.min(Math.floor(maxLinks), 200) : 40,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(Math.floor(timeoutMs), 60000) : 10000,
    mcpProtocolVersion: String(
      discovery.mcpProtocolVersion || DEFAULT_DISCOVERY_POLICY.mcpProtocolVersion,
    ),
    privatePathSegments,
  };
}

export function discoveryPolicyFromProfile(profile = {}, overrides = {}) {
  return createDiscoveryPolicy(profile, overrides);
}

export function policyPathForEndpoint(endpoint) {
  try {
    return new URL(endpoint.path, 'https://discovery.invalid').pathname;
  } catch {
    return endpoint.path;
  }
}
