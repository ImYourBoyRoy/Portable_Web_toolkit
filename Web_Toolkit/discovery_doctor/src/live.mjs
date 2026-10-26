/**
 * Bounded live endpoint checks for Discovery Doctor.
 *
 * These checks use public GET/POST requests only. They do not send cookies,
 * authorization headers, or credentials, and they only follow links on the
 * target origin. MCP validation is a protocol smoke test, not an attempt to
 * execute tools or inspect private resources.
 */

import { assertPublicHttpUrl, fetchPublicText } from '../../shared/lib/url-safety.mjs';
import { contentType, contentTypeMatches, looksLikeJson } from './validate.mjs';

const MODERN_MCP_VERSION = '2026-07-28';
const DEFAULT_LEGACY_MCP_VERSION = '2025-11-25';

function responseHeaders(response) {
  return Object.fromEntries(response.headers?.entries?.() || []);
}

async function readBoundedText(response, maxBytes = 2 * 1024 * 1024) {
  const declaredLength = Number(response.headers?.get?.('content-length') || 0);
  if (declaredLength > maxBytes) throw new Error(`MCP response exceeds ${maxBytes} bytes.`);
  if (!response.body?.getReader) {
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > maxBytes) throw new Error(`MCP response exceeds ${maxBytes} bytes.`);
    return body;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`MCP response exceeds ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function jsonFromResponse(body, headers = {}) {
  const type = contentType(headers);
  if (type.includes('text/event-stream')) {
    const values = [];
    for (const line of String(body || '').split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const value = line.slice(5).trim();
      if (!value || value === '[DONE]') continue;
      try {
        values.push(JSON.parse(value));
      } catch {
        // Ignore non-JSON SSE commentary; the caller reports if no JSON event exists.
      }
    }
    return values.at(-1) || null;
  }
  try {
    return JSON.parse(String(body || ''));
  } catch {
    return null;
  }
}

function headerValue(headers = {}, name) {
  const wanted = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === wanted)?.[1] || '';
}

function isModernVersion(version) {
  return String(version || '').trim() === MODERN_MCP_VERSION;
}

function modernMeta(options = {}) {
  return {
    'io.modelcontextprotocol/protocolVersion': String(options.protocolVersion || MODERN_MCP_VERSION),
    'io.modelcontextprotocol/clientInfo': {
      name: String(options.clientName || 'portable-web-toolkit-discovery-doctor'),
      version: '1.0.0',
    },
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

function rpcPayload(method, id, options = {}) {
  const params = { ...(options.params || {}) };
  if (options.modern) params._meta = { ...modernMeta(options), ...(params._meta || {}) };
  return {
    jsonrpc: '2.0',
    ...(id === undefined ? {} : { id }),
    method,
    params,
  };
}

async function requestJsonRpc(urlInput, payload, options = {}) {
  const url = assertPublicHttpUrl(urlInput, 'MCP endpoint');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const headers = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };
  if (options.modern) {
    headers['MCP-Protocol-Version'] = String(options.protocolVersion || MODERN_MCP_VERSION);
    headers['Mcp-Method'] = payload.method;
    if (options.principalName) headers['Mcp-Name'] = options.principalName;
  } else if (options.sessionId) {
    headers['Mcp-Session-Id'] = options.sessionId;
  }

  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || 15000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseBody = await readBoundedText(response);
    const responseHeadersValue = responseHeaders(response);
    const finalUrl = response.url || url.href;
    if (new URL(finalUrl).origin !== url.origin) {
      throw new Error(`MCP endpoint redirected off origin to ${finalUrl}`);
    }
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers: responseHeadersValue,
      body: responseBody,
      json: jsonFromResponse(responseBody, responseHeadersValue),
      sessionId: headerValue(responseHeadersValue, 'mcp-session-id'),
      url: finalUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function protocolError(response, label) {
  if (!response.ok) return `${label} returned HTTP ${response.status}`;
  if (!response.json || response.json.jsonrpc !== '2.0') return `${label} did not return a JSON-RPC 2.0 response`;
  if (response.json.error) {
    return `${label} returned JSON-RPC error ${response.json.error.code ?? 'unknown'}: ${response.json.error.message || 'unknown error'}`;
  }
  if (!response.json.result || typeof response.json.result !== 'object') return `${label} omitted result`;
  return '';
}

function methodUnavailable(response) {
  return response.status === 404 || response.status === 405 || response.json?.error?.code === -32601;
}

function advertisedVersions(result = {}) {
  const values = result.supportedVersions || result.supportedProtocolVersions || result.protocolVersions;
  return Array.isArray(values) ? values.map(String) : [];
}

function cacheHintWarnings(result, label, modern) {
  if (!modern) return [];
  const warnings = [];
  if (!Number.isFinite(Number(result?.ttlMs))) warnings.push(`${label} omitted modern ttlMs cache hint`);
  if (!['public', 'private'].includes(result?.cacheScope)) warnings.push(`${label} omitted modern cacheScope hint`);
  return warnings;
}

async function verifyLists(urlInput, options, result, modern) {
  const errors = [];
  const warnings = [];
  const collections = {};
  const capabilities = result?.capabilities || {};
  const methods = [
    { method: 'tools/list', key: 'tools', required: Boolean(capabilities.tools) },
    ...(capabilities.resources ? [{ method: 'resources/list', key: 'resources', required: false }] : []),
    ...(capabilities.prompts ? [{ method: 'prompts/list', key: 'prompts', required: false }] : []),
  ];

  for (const [index, item] of methods.entries()) {
    const response = await requestJsonRpc(urlInput, rpcPayload(item.method, index + 2, {
      modern,
      protocolVersion: options.protocolVersion,
      clientName: options.clientName,
      sessionId: options.sessionId,
    }), {
      ...options,
      modern,
      principalName: '',
    });
    const error = protocolError(response, `MCP ${item.method}`);
    if (error) {
      if (!item.required && methodUnavailable(response)) {
        warnings.push(`${item.method} was advertised but not available`);
      } else if (item.required || !methodUnavailable(response)) {
        errors.push(error);
      }
      continue;
    }
    const list = response.json.result[item.key];
    if (!Array.isArray(list)) {
      errors.push(`MCP ${item.method} result.${item.key} must be an array`);
      continue;
    }
    collections[item.key] = list;
    warnings.push(...cacheHintWarnings(response.json.result, `MCP ${item.method}`, modern));
  }

  return { errors, warnings, collections, tools: collections.tools || [] };
}

async function checkLegacyMcp(urlInput, options = {}) {
  const errors = [];
  const warnings = [];
  const protocolVersion = String(options.protocolVersion || DEFAULT_LEGACY_MCP_VERSION);
  const initialized = rpcPayload('initialize', 1, {
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: {
        name: String(options.clientName || 'portable-web-toolkit-discovery-doctor'),
        version: '1.0.0',
      },
    },
  });
  const init = await requestJsonRpc(urlInput, initialized, { ...options, modern: false });
  const initError = protocolError(init, 'MCP initialize');
  if (initError) return { ok: false, errors: [initError], warnings, tools: [], collections: {}, protocolVersion: '' };

  const negotiated = String(init.json.result.protocolVersion || '');
  if (!negotiated) warnings.push('MCP initialize response did not declare protocolVersion');
  else if (negotiated !== protocolVersion) warnings.push(`MCP negotiated protocol ${negotiated} (requested ${protocolVersion})`);

  const sessionId = init.sessionId;
  const notification = await requestJsonRpc(
    urlInput,
    rpcPayload('notifications/initialized', undefined),
    { ...options, modern: false, sessionId },
  );
  if (!(notification.status === 202 || notification.status === 204 || notification.ok)) {
    warnings.push(`MCP initialized notification returned HTTP ${notification.status}`);
  }

  const lists = await verifyLists(urlInput, { ...options, protocolVersion: negotiated || protocolVersion, sessionId }, init.json.result, false);
  errors.push(...lists.errors);
  warnings.push(...lists.warnings);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    tools: lists.tools,
    collections: lists.collections,
    protocolVersion: negotiated,
    sessionId: sessionId || '',
    era: 'legacy',
  };
}

async function checkModernMcp(urlInput, options = {}) {
  const protocolVersion = MODERN_MCP_VERSION;
  const discover = await requestJsonRpc(
    urlInput,
    rpcPayload('server/discover', 1, { modern: true, protocolVersion, clientName: options.clientName }),
    { ...options, modern: true, protocolVersion },
  );
  const discoverError = protocolError(discover, 'MCP server/discover');
  if (discoverError) {
    return {
      ok: false,
      unavailable: methodUnavailable(discover),
      errors: [discoverError],
      warnings: [],
      tools: [],
      collections: {},
      protocolVersion: '',
      era: 'modern',
    };
  }

  const versions = advertisedVersions(discover.json.result);
  if (versions.length && !versions.includes(protocolVersion)) {
    return {
      ok: false,
      unavailable: false,
      errors: [`MCP server/discover did not advertise ${protocolVersion} (advertised: ${versions.join(', ')})`],
      warnings: [],
      tools: [],
      collections: {},
      protocolVersion: versions[0] || '',
      era: 'modern',
    };
  }
  const lists = await verifyLists(urlInput, { ...options, modern: true, protocolVersion }, discover.json.result, true);
  return {
    ok: lists.errors.length === 0,
    unavailable: false,
    errors: lists.errors,
    warnings: [...lists.warnings, ...cacheHintWarnings(discover.json.result, 'MCP server/discover', true)],
    tools: lists.tools,
    collections: lists.collections,
    protocolVersion,
    era: 'modern',
  };
}

/**
 * Validate modern MCP 2026-07-28 when available, falling back to the
 * handshake-era protocol through 2025-11-25 for older servers. No tools are
 * called; only discovery/list methods are issued.
 */
export async function checkMcpEndpoint(urlInput, options = {}) {
  const requested = String(options.protocolVersion || MODERN_MCP_VERSION);
  const baseOptions = {
    ...options,
    clientName: options.clientName || 'portable-web-toolkit-discovery-doctor',
    timeoutMs: Number(options.timeoutMs || 15000),
  };
  try {
    if (isModernVersion(requested)) {
      const modern = await checkModernMcp(urlInput, baseOptions);
      if (!modern.unavailable) return modern;
      const legacy = await checkLegacyMcp(urlInput, { ...baseOptions, protocolVersion: DEFAULT_LEGACY_MCP_VERSION });
      return {
        ...legacy,
        warnings: [`modern ${MODERN_MCP_VERSION} discovery unavailable; fell back to legacy ${DEFAULT_LEGACY_MCP_VERSION}`, ...legacy.warnings],
      };
    }
    return await checkLegacyMcp(urlInput, { ...baseOptions, protocolVersion: requested });
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      tools: [],
      collections: {},
      protocolVersion: '',
      era: isModernVersion(requested) ? 'modern' : 'legacy',
    };
  }
}

function sameOrigin(url, base) {
  return url.origin === base.origin;
}

function pathKey(url) {
  return `${url.pathname}${url.search}`;
}

function isMcpLink(link, policy) {
  if (link.format === 'mcp') return true;
  if (policy.endpoints.some((endpoint) => {
    if (endpoint.format !== 'mcp') return false;
    try {
      return pathKey(new URL(endpoint.path, 'https://discovery.invalid')) === pathKey(link.url);
    } catch {
      return false;
    }
  })) return true;
  return /(?:^|\/)(?:mcp|mcp\.json)(?:\/|$)/i.test(link.url.pathname);
}

/**
 * Check same-origin links exposed by a valid llms document. External links and
 * URI templates are reported as informational rather than fetched.
 */
export async function checkDiscoveryLinks(options = {}) {
  const base = assertPublicHttpUrl(options.baseUrl, 'base URL');
  const links = Array.isArray(options.links) ? options.links : [];
  const policy = options.policy || {};
  const maxLinks = Math.max(0, Math.min(Number(options.maxLinks || policy.maxLinks || 40), 200));
  const checked = new Set(options.skipPaths || []);
  const results = [];
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  let considered = 0;

  for (const link of links) {
    if (considered >= maxLinks) break;
    if (!link?.valid || !link.url) continue;
    if (link.hasTemplate) {
      results.push({ status: 'info', label: `Discovery link: ${link.label}`, detail: 'URI template documented; skipped live fetch' });
      continue;
    }
    if (!sameOrigin(link.url, base)) {
      results.push({ status: 'info', label: `Discovery link: ${link.label}`, detail: 'External link; skipped live fetch' });
      continue;
    }
    const key = pathKey(link.url);
    if (checked.has(key)) continue;
    checked.add(key);
    considered += 1;

    if (isMcpLink(link, policy)) {
      const mcp = await checkMcpEndpoint(link.url.href, {
        fetchImpl,
        protocolVersion: policy.mcpProtocolVersion,
        timeoutMs: policy.timeoutMs,
      });
      if (mcp.ok) results.push({ status: 'pass', label: `MCP: ${link.label}`, detail: `${mcp.era} discovery + lists OK (${mcp.tools.length} tools)` });
      else results.push({ status: 'fail', label: `MCP: ${link.label}`, detail: mcp.errors.join('; ') });
      for (const warning of mcp.warnings) results.push({ status: 'warn', label: `MCP: ${link.label}`, detail: warning });
      continue;
    }

    try {
      const response = await fetchPublicText(link.url.href, {
        label: `discovery link ${link.href}`,
        fetchOptions: { method: 'GET' },
        fetchImpl,
      });
      if (!sameOrigin(response.url ? new URL(response.url) : link.url, base)) {
        results.push({ status: 'fail', label: `Discovery link: ${link.label}`, detail: `redirected off origin to ${response.url}` });
        continue;
      }
      if (!response.ok) {
        results.push({ status: 'fail', label: `Discovery link: ${link.label}`, detail: `returned HTTP ${response.status}` });
        continue;
      }
      const typeCheck = contentTypeMatches(response.headers, link.url.pathname.endsWith('.json') || link.url.pathname.startsWith('/api/')
        ? ['application/json', 'application/*+json']
        : ['text/html', 'text/plain', 'text/markdown', 'application/xhtml+xml', 'application/json', 'application/*+json']);
      if (!typeCheck.ok) {
        results.push({ status: 'warn', label: `Discovery link: ${link.label}`, detail: `unexpected content type ${typeCheck.actual}` });
      } else if ((link.url.pathname.endsWith('.json') || link.url.pathname.startsWith('/api/')) && !looksLikeJson(response.body)) {
        results.push({ status: 'fail', label: `Discovery link: ${link.label}`, detail: 'returned invalid JSON' });
      } else {
        results.push({ status: 'pass', label: `Discovery link: ${link.label}`, detail: `GET ${response.status}` });
      }
    } catch (error) {
      results.push({ status: 'fail', label: `Discovery link: ${link.label}`, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  if (links.length > maxLinks) results.push({ status: 'info', label: 'Discovery link checks', detail: `capped at ${maxLinks} same-origin links` });
  return { results, checked: considered };
}
