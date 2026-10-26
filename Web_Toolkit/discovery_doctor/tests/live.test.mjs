// ./Web_Toolkit/discovery_doctor/tests/live.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchPublicText } from '../../shared/lib/url-safety.mjs';
import { checkDiscoveryLinks, checkMcpEndpoint } from '../src/live.mjs';
import { createDiscoveryPolicy } from '../src/policy.mjs';

function mockFetch(url, init = {}) {
  const body = JSON.parse(init.body || '{}');
  if (body.method === 'server/discover') {
    return Promise.resolve(new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        supportedVersions: ['2026-07-28'],
        capabilities: { tools: {} },
        ttlMs: 0,
        cacheScope: 'private',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  if (body.method === 'initialize') {
    return Promise.resolve(new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'fixture', version: '1.0.0' },
      },
    }), { status: 200, headers: { 'content-type': 'application/json', 'mcp-session-id': 'fixture-session' } }));
  }
  if (body.method === 'notifications/initialized') return Promise.resolve(new Response(null, { status: 202 }));
  if (body.method === 'tools/list') {
    return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [], ttlMs: 0, cacheScope: 'private' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
  }
  if (new URL(url).pathname.endsWith('.json')) {
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  return Promise.resolve(new Response('<html><body>ok</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
}

function legacyMockFetch(url, init = {}) {
  const body = JSON.parse(init.body || '{}');
  if (body.method === 'server/discover') {
    return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
  }
  if (body.method === 'initialize') {
    return Promise.resolve(new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'legacy', version: '1.0.0' } },
    }), { status: 200, headers: { 'content-type': 'application/json', 'mcp-session-id': 'legacy-session' } }));
  }
  if (body.method === 'notifications/initialized') return Promise.resolve(new Response(null, { status: 202 }));
  return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [] } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
}

describe('MCP live probe', () => {
  it('validates modern discovery and tools/list without invoking tools', async () => {
    const result = await checkMcpEndpoint('https://example.com/api/mcp', { fetchImpl: mockFetch });
    assert.equal(result.ok, true);
    assert.equal(result.protocolVersion, '2026-07-28');
    assert.deepEqual(result.tools, []);
  });

  it('falls back to the legacy handshake only when modern discovery is unavailable', async () => {
    const result = await checkMcpEndpoint('https://example.com/api/mcp', { fetchImpl: legacyMockFetch });
    assert.equal(result.ok, true);
    assert.equal(result.era, 'legacy');
    assert.equal(result.protocolVersion, '2025-11-25');
    assert.match(result.warnings.join(' '), /fell back to legacy/i);
  });

  it('rejects MCP redirects that leave the endpoint origin', async () => {
    const result = await checkMcpEndpoint('https://example.com/api/mcp', {
      fetchImpl: async () => ({
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        url: 'https://untrusted.example/mcp',
        text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
      }),
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /redirected off origin/i);
  });
});

describe('bounded public fetch helper', () => {
  it('returns headers and rejects oversized response bodies', async () => {
    const result = await fetchPublicText('https://example.com/llms.txt', {
      fetchImpl: async () => new Response('ok', { headers: { 'content-type': 'text/plain; charset=utf-8' } }),
    });
    assert.equal(result.body, 'ok');
    assert.equal(result.headers['content-type'], 'text/plain; charset=utf-8');
    await assert.rejects(
      fetchPublicText('https://example.com/large.txt', {
        maxBytes: 2,
        fetchImpl: async () => new Response('too large'),
      }),
      /exceeds 2 bytes/i,
    );
  });
});

describe('discovery policy and links', () => {
  it('requires core discovery artifacts by default while allowing explicit relaxation', () => {
    const defaults = createDiscoveryPolicy();
    assert.equal(defaults.required.llms, true);
    assert.equal(defaults.required.llmsFull, true);
    assert.equal(defaults.required.humans, true);
    assert.equal(defaults.required.securityTxt, true);
    assert.equal(defaults.required.contentApi, true);
    assert.equal(defaults.required.searchApi, false);

    const development = createDiscoveryPolicy({ environment: 'development' });
    assert.equal(development.required.humans, true);
    assert.equal(development.required.securityTxt, false);
    assert.equal(development.required.sitemap, false);

    const developmentWithSecurity = createDiscoveryPolicy({
      environment: 'development',
      required: { securityTxt: true },
    });
    assert.equal(developmentWithSecurity.required.securityTxt, true);

    const policy = createDiscoveryPolicy({
      discovery: {
        required: {
          llms: false,
          llmsFull: false,
          humans: false,
          securityTxt: false,
          contentApi: false,
        },
        endpoints: [{ path: '/api/v1/mcp', label: 'Public MCP', format: 'mcp', required: true }],
      },
    });
    assert.equal(policy.required.llms, false);
    assert.equal(policy.required.llmsFull, false);
    assert.equal(policy.required.humans, false);
    assert.equal(policy.required.securityTxt, false);
    assert.equal(policy.required.contentApi, false);
    assert.equal(policy.endpoints[0].format, 'mcp');
    assert.equal(policy.endpoints[0].required, true);
  });

  it('checks same-origin JSON and MCP links but does not fetch external links', async () => {
    const policy = createDiscoveryPolicy({ endpoints: [{ path: '/api/mcp', label: 'MCP', format: 'mcp' }] });
    const result = await checkDiscoveryLinks({
      baseUrl: 'https://example.com/',
      policy,
      fetchImpl: mockFetch,
      links: [
        { label: 'API', href: '/api/catalog.json', valid: true, url: new URL('https://example.com/api/catalog.json') },
        { label: 'MCP', href: '/api/mcp', valid: true, url: new URL('https://example.com/api/mcp') },
        { label: 'Other site', href: 'https://other.example/', valid: true, url: new URL('https://other.example/') },
      ],
    });
    assert.equal(result.results.some((entry) => entry.status === 'pass' && /API/.test(entry.label)), true);
    assert.equal(result.results.some((entry) => entry.status === 'pass' && /MCP/.test(entry.label)), true);
    assert.equal(result.results.some((entry) => entry.status === 'info' && /external/i.test(entry.detail)), true);
  });
});
