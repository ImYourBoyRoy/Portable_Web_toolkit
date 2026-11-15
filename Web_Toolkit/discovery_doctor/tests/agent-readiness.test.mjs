import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  analyzeAiPolicy,
  analyzeApiCatalog,
  analyzeMarkdownTwin,
  analyzeServerCard,
  compareCanonical,
  headersForPath,
  markdownTwinPaths,
  parseHeadersFile,
  parseLinkHeader,
  summarizeLinkHeader,
} from '../src/agent-readiness.mjs';
import { assertPublicHttpUrl } from '../../shared/lib/url-safety.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bin = path.resolve(__dirname, '../bin/discovery-doctor.mjs');
const toolkitRoot = path.resolve(__dirname, '../../..');

describe('Link headers', () => {
  it('parses RFC 8288 values with quoted and bare parameters', () => {
    const links = parseLinkHeader('<https://e.com/a/>; rel="canonical", <https://e.com/a/index.md>; rel="alternate"; type="text/markdown", </.well-known/api-catalog>; rel=api-catalog');
    assert.equal(links.length, 3);
    assert.deepEqual(links[1].rel, ['alternate']);
    assert.equal(links[1].type, 'text/markdown');
    assert.deepEqual(links[2].rel, ['api-catalog']);
  });
  it('summarizes agent relations and flags unparseable values', () => {
    const summary = summarizeLinkHeader('<https://e.com/>; rel="canonical", <https://e.com/x.md>; rel="alternate"; type="text/markdown", </c>; rel="api-catalog"');
    assert.ok(summary.hasApiCatalog && summary.hasMarkdownAlternate && summary.hasCanonical);
    assert.equal(summarizeLinkHeader('not a link header').malformed, true);
    assert.equal(summarizeLinkHeader('').malformed, false);
  });
});

describe('_headers parsing', () => {
  it('matches exact paths and wildcards and joins repeated headers', () => {
    const rules = parseHeadersFile('# c\n/*\n  X-Frame-Options: DENY\n\n/about/\n  Link: <a>; rel="canonical"\n  Vary: Accept\n');
    const headers = headersForPath(rules, '/about/');
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers.vary, 'Accept');
    assert.equal(headersForPath(rules, '/other/').link, undefined);
  });
});

describe('API catalog (RFC 9727)', () => {
  it('accepts a linkset with descriptions', () => {
    const result = analyzeApiCatalog(JSON.stringify({ linkset: [{ anchor: 'https://e.com/api/x', 'service-desc': [{ href: 'https://e.com/openapi.json' }] }] }));
    assert.equal(result.ok, true);
    assert.equal(result.apis, 1);
  });
  it('rejects non-linksets, relative anchors and malformed targets', () => {
    assert.equal(analyzeApiCatalog('nope').ok, false);
    assert.equal(analyzeApiCatalog('{"apis":[]}').ok, false);
    assert.equal(analyzeApiCatalog(JSON.stringify({ linkset: [{ anchor: '/relative' }] })).ok, false);
    assert.equal(analyzeApiCatalog(JSON.stringify({ linkset: [{ anchor: 'https://e.com/a', 'service-desc': [{}] }] })).ok, false);
  });
  it('warns when no entry describes an API', () => {
    const result = analyzeApiCatalog(JSON.stringify({ linkset: [{ anchor: 'https://e.com/a' }] }));
    assert.equal(result.ok, true);
    assert.ok(result.warnings.length);
  });
});

describe('MCP server card', () => {
  it('requires a name and an endpoint', () => {
    assert.equal(analyzeServerCard('{}').ok, false);
    const ok = analyzeServerCard(JSON.stringify({ name: 'x', description: 'd', remotes: [{ type: 'streamable-http', url: 'https://e.com/mcp' }], tools: [{ name: 't' }] }), { origin: 'https://e.com' });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.remotes, ['https://e.com/mcp']);
  });
  it('warns about off-origin remotes', () => {
    const result = analyzeServerCard(JSON.stringify({ name: 'x', remotes: [{ url: 'https://other.example/mcp' }] }), { origin: 'https://e.com' });
    assert.ok(result.warnings.some((warning) => /not on/.test(warning)));
  });
});

describe('AI crawler policy', () => {
  const robots = [
    'User-agent: *', 'Content-Signal: search=yes, ai-input=yes, ai-train=no', 'Allow: /', 'Disallow: /private/', '',
    'User-agent: GPTBot', 'Allow: /', '',
    'User-agent: ClaudeBot', 'Allow: /', 'Disallow: /private/', '',
  ].join('\n');
  it('reads Content-Signal values and named AI groups', () => {
    const result = analyzeAiPolicy(robots);
    assert.equal(result.declared, true);
    assert.equal(result.signals['ai-train'], 'no');
    assert.deepEqual(result.agents.sort(), ['claudebot', 'gptbot']);
  });
  it('warns when a named group drops the wildcard Disallow rules', () => {
    const result = analyzeAiPolicy(robots);
    assert.ok(result.warnings.some((warning) => /gptbot/.test(warning)));
    assert.ok(!result.warnings.some((warning) => /claudebot/.test(warning)));
  });
  it('reports an undeclared policy and blocked crawlers', () => {
    assert.equal(analyzeAiPolicy('User-agent: *\nAllow: /\n').declared, false);
    assert.deepEqual(analyzeAiPolicy('User-agent: CCBot\nDisallow: /\n').blocked, ['ccbot']);
  });
});

describe('canonical and Markdown helpers', () => {
  it('detects trailing-slash disagreement', () => {
    const html = '<link rel="canonical" href="https://e.com/about/">';
    assert.equal(compareCanonical('https://e.com/about/', html).ok, true);
    const bad = compareCanonical('https://e.com/about', html);
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, 'trailing slash differs');
    assert.equal(compareCanonical('https://e.com/', '<html></html>').reason, 'missing canonical link');
  });
  it('rejects empty twins and raw HTML', () => {
    assert.equal(analyzeMarkdownTwin('hi').ok, false);
    assert.equal(analyzeMarkdownTwin(`# T\n\n${'text '.repeat(30)}<div>x</div>`).ok, false);
    assert.equal(analyzeMarkdownTwin(`# T\n\n${'text '.repeat(30)}`, { canonical: 'https://e.com/' }).ok, true);
  });
  it('maps pages to twin paths', () => {
    assert.deepEqual(markdownTwinPaths('/about/'), ['/about/index.md']);
    assert.deepEqual(markdownTwinPaths('/about'), ['/about.md', '/about/index.md']);
  });
});

describe('loopback opt-in', () => {
  it('stays blocked by default and opens only loopback addresses when asked', () => {
    assert.throws(() => assertPublicHttpUrl('http://127.0.0.1:8788/'), /private, loopback|localhost/);
    assert.throws(() => assertPublicHttpUrl('http://localhost:3000/'), /localhost/);
    assert.equal(assertPublicHttpUrl('http://127.0.0.1:8788/', 'x', { allowLoopback: true }).hostname, '127.0.0.1');
    assert.equal(assertPublicHttpUrl('http://localhost:3000/', 'x', { allowLoopback: true }).hostname, 'localhost');
    assert.throws(() => assertPublicHttpUrl('http://192.168.1.5/', 'x', { allowLoopback: true }), /private/);
    assert.throws(() => assertPublicHttpUrl('http://169.254.169.254/', 'x', { allowLoopback: true }), /private/);
    assert.throws(() => assertPublicHttpUrl('http://metadata.google.internal/', 'x', { allowLoopback: true }), /local-only/);
  });
});

function writeSite(dir, { slashMismatch = false, twins = true } = {}) {
  const write = (file, body) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), body); };
  const base = 'https://example.com';
  write('sitemap.xml', `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc></url><url><loc>${base}/about${slashMismatch ? '' : '/'}</loc></url></urlset>`);
  write('robots.txt', 'User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n');
  write('llms.txt', '# Demo\n\n> Demo site.\n\n## Pages\n- [About](https://example.com/about/): about\n');
  write('llms-full.txt', '# Demo full\n');
  write('humans.txt', '/* team */');
  write('.well-known/security.txt', 'Contact: mailto:sec@example.com\nExpires: 2099-01-01T00:00:00Z\n');
  write('api/content.json', '{"pages":[]}');
  write('index.html', `<html><head><link rel="canonical" href="${base}/"><script type="application/ld+json">{"@type":"WebSite","name":"Demo"}</script></head><body></body></html>`);
  write('about/index.html', `<html><head><link rel="canonical" href="${base}/about/"></head><body></body></html>`);
  write('.well-known/api-catalog', JSON.stringify({ linkset: [{ anchor: `${base}/api/content.json`, 'service-desc': [{ href: `${base}/openapi.json` }] }] }));
  write('.well-known/mcp/server-card.json', JSON.stringify({ name: 'demo', description: 'd', remotes: [{ type: 'streamable-http', url: `${base}/mcp` }] }));
  if (twins) {
    write('index.md', `---\ncanonical: ${base}/\n---\n\n# Home\n\n${'Real page text. '.repeat(10)}`);
    write('about/index.md', `---\ncanonical: ${base}/about/\n---\n\n# About\n\n${'Real page text. '.repeat(10)}`);
  }
  const link = (url) => `  Link: <${url}>; rel="canonical", <${url}index.md>; rel="alternate"; type="text/markdown", </.well-known/api-catalog>; rel="api-catalog"\n  Vary: Accept`;
  write('_headers', [
    '/*', '  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload', '  X-Content-Type-Options: nosniff', '  X-Frame-Options: DENY',
    '  Referrer-Policy: strict-origin-when-cross-origin', '  Permissions-Policy: camera=(), microphone=(), geolocation=()', "  Content-Security-Policy: default-src 'self'", '',
    '/', link(`${base}/`), '', '/about/', link(`${base}/about/`), '',
    '/.well-known/api-catalog', '  Content-Type: application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"', '',
  ].join('\n'));
}

const runDoctor = (dir, extra = []) => spawnSync(process.execPath, [bin, dir, '--json', ...extra], { encoding: 'utf8', cwd: toolkitRoot });
const rowsFor = (report, prefix) => report.results.filter((row) => row.label.startsWith(prefix));

describe('doctor agent-readiness on a local build', () => {
  it('passes every agent check for a fully equipped site', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-agent-ok-'));
    writeSite(dir);
    const result = runDoctor(dir);
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 0, result.stdout);
    for (const label of ['Sitemap/canonical agreement', 'Markdown twins', 'Link headers', 'API catalog', 'MCP server card', 'AI crawler policy']) {
      assert.equal(rowsFor(report, label)[0]?.status, 'pass', `${label}: ${JSON.stringify(rowsFor(report, label))}`);
    }
  });

  it('keeps absent surfaces informational so existing sites still pass', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-agent-bare-'));
    writeSite(dir, { twins: false });
    fs.rmSync(path.join(dir, '.well-known/api-catalog'));
    fs.rmSync(path.join(dir, '.well-known/mcp'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n');
    const headers = fs.readFileSync(path.join(dir, '_headers'), 'utf8').split('\n/')[0];
    fs.writeFileSync(path.join(dir, '_headers'), headers);
    const result = runDoctor(dir);
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 0, result.stdout);
    for (const label of ['Markdown twins', 'Link headers', 'API catalog', 'MCP server card', 'AI crawler policy']) {
      assert.equal(rowsFor(report, label)[0]?.status, 'info', label);
    }
  });

  it('fails an absent surface that the policy requires', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-agent-req-'));
    writeSite(dir, { twins: false });
    const policy = path.join(dir, 'policy.json');
    fs.writeFileSync(policy, JSON.stringify({ required: { markdownTwins: true } }));
    const result = runDoctor(dir, ['--policy', policy]);
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 2);
    assert.equal(rowsFor(report, 'Markdown twins')[0].status, 'fail');
  });

  it('warns on trailing-slash disagreement and fails it when required', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-agent-slash-'));
    writeSite(dir, { slashMismatch: true });
    const warned = JSON.parse(runDoctor(dir).stdout);
    assert.equal(rowsFor(warned, 'Sitemap/canonical')[0].status, 'warn');
    assert.match(rowsFor(warned, 'Sitemap/canonical')[0].detail, /trailing slash differs/);
    const policy = path.join(dir, 'policy.json');
    fs.writeFileSync(policy, JSON.stringify({ required: { canonicalConsistency: true } }));
    const strict = runDoctor(dir, ['--policy', policy]);
    assert.equal(strict.status, 2);
    assert.equal(rowsFor(JSON.parse(strict.stdout), 'Sitemap/canonical')[0].status, 'fail');
  });

  it('fails a malformed API catalog and flags a wrong catalog content type', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-agent-bad-'));
    writeSite(dir);
    fs.writeFileSync(path.join(dir, '.well-known/api-catalog'), '{"apis": []}');
    const result = runDoctor(dir);
    assert.equal(result.status, 2);
    assert.equal(rowsFor(JSON.parse(result.stdout), 'API catalog')[0].status, 'fail');
  });
});

describe('doctor agent-readiness against a live loopback server', () => {
  it('requires --allow-loopback, then validates negotiation, twins, catalog and the MCP endpoint', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-agent-live-'));
    writeSite(dir);
    const origin = { value: '' };
    const read = (file) => fs.readFileSync(path.join(dir, file));
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      const send = (status, type, body, headers = {}) => { response.writeHead(status, { 'content-type': type, ...headers }); response.end(body); };
      const wantsMarkdown = String(request.headers.accept || '').includes('text/markdown');
      const pageLink = (p) => `<https://example.com${p}>; rel="canonical", <https://example.com${p}index.md>; rel="alternate"; type="text/markdown", </.well-known/api-catalog>; rel="api-catalog"`;
      const fix = (body) => String(body).replaceAll('https://example.com', origin.value);
      if (url.pathname === '/sitemap.xml') return send(200, 'application/xml', fix(read('sitemap.xml')));
      if (url.pathname === '/robots.txt') return send(200, 'text/plain', read('robots.txt'));
      if (url.pathname === '/ai.txt') return send(404, 'text/plain', 'no');
      if (url.pathname === '/.well-known/api-catalog') return send(200, 'application/linkset+json', read('.well-known/api-catalog'));
      if (url.pathname === '/.well-known/mcp/server-card.json') return send(200, 'application/json', fix(read('.well-known/mcp/server-card.json')));
      if (url.pathname === '/mcp' && request.method === 'POST') {
        let body = '';
        request.on('data', (chunk) => { body += chunk; });
        request.on('end', () => {
          const message = JSON.parse(body || '{}');
          const result = message.method === 'server/discover'
            ? { supportedVersions: ['2026-07-28'], capabilities: { tools: {} }, ttlMs: 60000, cacheScope: 'public' }
            : message.method === 'tools/list' ? { tools: [{ name: 'a' }], ttlMs: 60000, cacheScope: 'public' } : {};
          send(200, 'application/json', JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
        });
        return;
      }
      const page = url.pathname === '/' ? '/' : url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
      if (url.pathname.endsWith('/index.md')) return send(200, 'text/markdown; charset=utf-8', fix(read(url.pathname.slice(1))));
      if (['/', '/about/'].includes(page)) {
        if (wantsMarkdown) return send(200, 'text/markdown; charset=utf-8', fix(read(`${page.slice(1)}index.md`)), { vary: 'Accept' });
        return send(200, 'text/html', fix(read(`${page.slice(1)}index.html`)), { link: pageLink(page), vary: 'Accept' });
      }
      return send(404, 'text/plain', 'not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin.value = `http://127.0.0.1:${server.address().port}`;
    // Without the flag the guard refuses before any request is made, so a synchronous spawn is safe here.
    const blocked = spawnSync(process.execPath, [bin, origin.value, '--json'], { encoding: 'utf8', cwd: toolkitRoot });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stdout, /must not target/);
    // The server shares this process's event loop, so the allowed run must be asynchronous.
    const child = await new Promise((resolve) => {
      const proc = spawn(process.execPath, [bin, origin.value, '--allow-loopback', '--json', '--skip-link-checks'], { cwd: toolkitRoot });
      let stdout = '';
      proc.stdout.on('data', (chunk) => { stdout += chunk; });
      proc.on('close', (code) => resolve({ code, stdout }));
    });
    server.close();
    const report = JSON.parse(child.stdout);
    const status = (prefix) => rowsFor(report, prefix).map((row) => `${row.status}:${row.detail}`).join(' | ');
    assert.match(status('Sitemap/canonical'), /^pass/, status('Sitemap/canonical'));
    assert.match(status('Markdown twins'), /^pass/, status('Markdown twins'));
    assert.match(status('Accept: text/markdown'), /^pass/, status('Accept: text/markdown'));
    assert.match(status('Link headers'), /^pass/, status('Link headers'));
    assert.match(status('API catalog'), /^pass/, status('API catalog'));
    assert.match(status('MCP server card'), /pass/, status('MCP server card'));
    assert.match(status('MCP server card endpoint'), /^pass/, status('MCP server card endpoint'));
    assert.match(status('AI crawler policy'), /^pass/, status('AI crawler policy'));
  });
});
