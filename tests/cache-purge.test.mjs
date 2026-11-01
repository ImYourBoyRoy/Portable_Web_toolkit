// ./tests/cache-purge.test.mjs
/**
 * Offline tests for cache-purge: dist-root detection, URL planning, batching,
 * rate-limit retry, partial-failure reporting, and prefix/zone handling.
 * Run: node --test ./tests/cache-purge.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { CloudflarePurgeError, purgeInBatches, resolveZoneId } from '../Web_Toolkit/cache_purge/src/lib/cloudflare.mjs';
import {
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  buildUrls,
  chunk,
  collectDistUrls,
  expandUrlVariants,
  resolveBatchSize,
  resolveDistRoot,
  toPrefix
} from '../Web_Toolkit/cache_purge/src/lib/urls.mjs';
import { planPurgeUrls, runPurge } from '../Web_Toolkit/cache_purge/src/commands/purge.mjs';

function makeProject(files, { workers = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-purge-'));
  const base = workers ? path.join(root, 'dist', 'client') : path.join(root, 'dist');
  if (workers) fs.mkdirSync(path.join(root, 'dist', 'server'), { recursive: true });
  for (const file of files) {
    const target = path.join(base, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'x');
  }
  return root;
}

function site(projectRoot, overrides = {}) {
  return {
    projectRoot,
    profile: { siteId: 'demo', zone: { name: 'example.com' }, cloudflare: {}, ...overrides.profile },
    productionHosts: ['example.com', 'www.example.com'],
    developmentHosts: ['dev.example.com'],
    env: { CLOUDFLARE_API_TOKEN: 'token', ...overrides.env }
  };
}

function jsonResponse(status, payload, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => payload
  };
}

/** Fake Cloudflare: zone lookup succeeds, purge calls are recorded and answered by `purgeReply`. */
function fakeCloudflare(purgeReply = () => jsonResponse(200, { success: true })) {
  const purgeBodies = [];
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('/zones?name=')) return jsonResponse(200, { success: true, result: [{ id: 'zone-1' }] });
    const body = JSON.parse(options.body);
    purgeBodies.push(body);
    return purgeReply(body, purgeBodies.length);
  };
  return { fetchImpl, purgeBodies };
}

const quiet = { log: () => {}, errorLog: () => {} };

test('resolveDistRoot prefers profile subdir, then dist/client beside dist/server, then dist', () => {
  const workers = makeProject(['index.html']);
  assert.equal(resolveDistRoot(workers, {}), path.join(workers, 'dist', 'client'));
  assert.equal(resolveDistRoot(workers, { cloudflare: { headers: { distSubdir: 'client' } } }), path.join(workers, 'dist', 'client'));
  assert.equal(resolveDistRoot(workers, { cloudflare: { cachePurge: { distSubdir: 'public/' } } }), path.join(workers, 'dist', 'public'));
  const pages = makeProject(['index.html'], { workers: false });
  assert.equal(resolveDistRoot(pages, {}), path.join(pages, 'dist'));
  assert.throws(() => resolveDistRoot(workers, { cloudflare: { cachePurge: { distSubdir: '../etc' } } }), /inside dist/);
});

test('collectDistUrls maps routes, skips hashed assets, maps, and edge config, and is sorted', () => {
  const root = makeProject([
    'index.html',
    'about/index.html',
    '404.html',
    'robots.txt',
    '_headers',
    '_astro/app.abc123.js',
    '_astro/app.abc123.js.map',
    'images/hero image.webp'
  ]);
  const urls = collectDistUrls(path.join(root, 'dist', 'client'), ['example.com']);
  assert.deepEqual(urls, [
    'https://example.com/',
    'https://example.com/404.html',
    'https://example.com/about/',
    'https://example.com/images/hero%20image.webp',
    'https://example.com/robots.txt'
  ]);
  const withAssets = collectDistUrls(path.join(root, 'dist', 'client'), ['example.com'], { includeAssets: true });
  assert.ok(withAssets.includes('https://example.com/_astro/app.abc123.js'));
  assert.ok(!withAssets.some((url) => url.endsWith('.map')));
});

test('collectDistUrls never emits /client/ or /server/ paths for the Workers layout', () => {
  const root = makeProject(['index.html', 'about/index.html']);
  const project = site(root);
  const { urls, source } = planPurgeUrls({ site: project, flags: {}, hosts: project.productionHosts });
  assert.equal(source, path.join(root, 'dist', 'client'));
  assert.ok(urls.every((url) => !/\/(client|server)\b/.test(url)));
});

test('planPurgeUrls adds slashless variants and profile extraPaths, with opt-out', () => {
  const root = makeProject(['index.html', 'about/index.html']);
  const project = site(root, { profile: { cloudflare: { cachePurge: { extraPaths: ['/api/content.json'] } } } });
  const hosts = ['example.com'];
  const full = planPurgeUrls({ site: project, flags: {}, hosts }).urls;
  assert.deepEqual(full.sort(), [
    'https://example.com/',
    'https://example.com/about',
    'https://example.com/about/',
    'https://example.com/api/content.json'
  ]);
  const plain = planPurgeUrls({ site: project, flags: { 'no-variants': true }, hosts }).urls;
  assert.ok(!plain.includes('https://example.com/about'));
});

test('planPurgeUrls uses explicit --urls untouched', () => {
  const project = site(makeProject(['index.html']));
  const { urls, source } = planPurgeUrls({ site: project, flags: { urls: 'https://example.com/a/, https://example.com/a/' }, hosts: ['example.com'] });
  assert.deepEqual(urls, ['https://example.com/a/']);
  assert.equal(source, '--urls');
});

test('expandUrlVariants, buildUrls, toPrefix, and chunk behave', () => {
  assert.deepEqual(expandUrlVariants(['https://e.com/', 'https://e.com/x/', 'https://e.com/y.txt']), [
    'https://e.com/',
    'https://e.com/x/',
    'https://e.com/x',
    'https://e.com/y.txt'
  ]);
  assert.deepEqual(buildUrls(['e.com'], ['a', '/b']), ['https://e.com/a', 'https://e.com/b']);
  assert.equal(toPrefix('https://www.e.com/foo/bar/?a=1#x'), 'www.e.com/foo/bar');
  assert.equal(toPrefix('https://e.com/'), 'e.com');
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('resolveBatchSize precedence, clamping, and validation', () => {
  assert.equal(resolveBatchSize({}), DEFAULT_BATCH_SIZE);
  assert.equal(resolveBatchSize({ env: { CF_CACHE_PURGE_BATCH_SIZE: '40' } }), 40);
  assert.equal(resolveBatchSize({ env: { CF_CACHE_PURGE_BATCH_SIZE: '40' }, profile: { cloudflare: { cachePurge: { batchSize: 25 } } } }), 25);
  assert.equal(resolveBatchSize({ flags: { 'batch-size': '10' }, env: { CF_CACHE_PURGE_BATCH_SIZE: '40' } }), 10);
  assert.equal(resolveBatchSize({ flags: { 'batch-size': '9999' } }), MAX_BATCH_SIZE);
  assert.throws(() => resolveBatchSize({ flags: { 'batch-size': 'abc' } }), /Invalid purge batch size/);
  assert.throws(() => resolveBatchSize({ flags: { 'batch-size': true } }), /Invalid purge batch size/);
  assert.throws(() => resolveBatchSize({ flags: { 'batch-size': '0' } }), /Invalid purge batch size/);
});

test('purgeInBatches splits 250 files into 100, 100, 50', async () => {
  const { fetchImpl, purgeBodies } = fakeCloudflare();
  const items = Array.from({ length: 250 }, (_, index) => `https://example.com/p${index}`);
  const result = await purgeInBatches({ token: 't', zoneId: 'z', key: 'files', items, batchSize: 100, fetchImpl });
  assert.deepEqual(purgeBodies.map((body) => body.files.length), [100, 100, 50]);
  assert.deepEqual(result, { batches: 3, submitted: 250 });
});

test('purgeInBatches retries HTTP 429 using Retry-After, then succeeds', async () => {
  const sleeps = [];
  const { fetchImpl, purgeBodies } = fakeCloudflare((_body, call) =>
    call === 1 ? jsonResponse(429, { success: false, errors: [{ code: 1015, message: 'rate limited' }] }, { 'retry-after': '7' }) : jsonResponse(200, { success: true })
  );
  const result = await purgeInBatches({
    token: 't', zoneId: 'z', key: 'files', items: ['https://example.com/a'], batchSize: 100, fetchImpl,
    sleep: async (ms) => { sleeps.push(ms); }
  });
  assert.deepEqual(sleeps, [7000]);
  assert.equal(purgeBodies.length, 2);
  assert.equal(result.submitted, 1);
});

test('purgeInBatches reports progress when a later batch is rejected', async () => {
  const { fetchImpl } = fakeCloudflare((_body, call) =>
    call === 2 ? jsonResponse(400, { success: false, errors: [{ code: 1094, message: 'too many files' }] }) : jsonResponse(200, { success: true })
  );
  const items = Array.from({ length: 5 }, (_, index) => `https://example.com/p${index}`);
  await assert.rejects(
    purgeInBatches({ token: 't', zoneId: 'z', key: 'files', items, batchSize: 2, fetchImpl }),
    (error) => error instanceof CloudflarePurgeError && error.submitted === 2 && error.remaining === 3 && /1094/.test(error.message)
  );
});

test('purgeInBatches gives up after repeated 429 responses', async () => {
  const { fetchImpl } = fakeCloudflare(() => jsonResponse(429, { success: false, errors: [] }));
  await assert.rejects(
    purgeInBatches({ token: 't', zoneId: 'z', key: 'files', items: ['https://example.com/a'], batchSize: 10, fetchImpl, sleep: async () => {}, maxRetries: 2 }),
    (error) => error instanceof CloudflarePurgeError && error.status === 429
  );
});

test('resolveZoneId throws when the zone cannot be found', async () => {
  const fetchImpl = async () => jsonResponse(200, { success: true, result: [] });
  await assert.rejects(resolveZoneId({ token: 't', zoneName: 'missing.com', fetchImpl }), /Unable to resolve zone "missing\.com"/);
});

test('runPurge dry-run plans batches and never calls the network', async () => {
  const root = makeProject(['index.html', 'about/index.html']);
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return jsonResponse(200, { success: true }); };
  const code = await runPurge({ site: site(root), flags: {}, fetchImpl, ...quiet });
  assert.equal(code, 0);
  assert.equal(calls, 0);
});

test('runPurge --apply submits scheme-complete files in batches', async () => {
  const root = makeProject(['index.html', 'about/index.html', 'tools/index.html']);
  const { fetchImpl, purgeBodies } = fakeCloudflare();
  const code = await runPurge({ site: site(root), flags: { apply: true, 'batch-size': '4' }, fetchImpl, ...quiet });
  assert.equal(code, 0);
  const sent = purgeBodies.flatMap((body) => body.files);
  // 3 routes + 2 slashless twins = 5 per host, 2 hosts = 10 files
  assert.equal(sent.length, 10);
  assert.ok(purgeBodies.every((body) => body.files.length <= 4));
  assert.ok(sent.every((url) => url.startsWith('https://')));
});

test('runPurge prefix mode sends scheme-free prefixes', async () => {
  const root = makeProject(['index.html', 'about/index.html']);
  const { fetchImpl, purgeBodies } = fakeCloudflare();
  const code = await runPurge({
    site: site(root),
    flags: { apply: true, mode: 'prefix', urls: 'https://example.com/about/,https://example.com/docs/guide/' },
    fetchImpl,
    ...quiet
  });
  assert.equal(code, 0);
  assert.deepEqual(purgeBodies, [{ prefixes: ['example.com/about', 'example.com/docs/guide'] }]);
});

test('runPurge hostname and everything modes send single bodies', async () => {
  const root = makeProject(['index.html']);
  const hosts = fakeCloudflare();
  assert.equal(await runPurge({ site: site(root), flags: { apply: true, mode: 'hostname' }, fetchImpl: hosts.fetchImpl, ...quiet }), 0);
  assert.deepEqual(hosts.purgeBodies, [{ hosts: ['example.com', 'www.example.com'] }]);
  const everything = fakeCloudflare();
  assert.equal(await runPurge({ site: site(root), flags: { apply: true, mode: 'everything' }, fetchImpl: everything.fetchImpl, ...quiet }), 0);
  assert.deepEqual(everything.purgeBodies, [{ purge_everything: true }]);
});

test('runPurge returns 1 with nothing to purge, on rejection, and throws for a missing token or zone', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-purge-empty-'));
  assert.equal(await runPurge({ site: site(empty), flags: {}, ...quiet }), 1);

  const root = makeProject(['index.html']);
  const rejecting = fakeCloudflare(() => jsonResponse(400, { success: false, errors: [{ code: 1094, message: 'nope' }] }));
  assert.equal(await runPurge({ site: site(root), flags: { apply: true }, fetchImpl: rejecting.fetchImpl, ...quiet }), 1);

  await assert.rejects(runPurge({ site: site(root, { env: { CLOUDFLARE_API_TOKEN: '' } }), flags: { apply: true }, ...quiet }), /Missing CLOUDFLARE_API_TOKEN/);

  const noZone = async () => jsonResponse(200, { success: true, result: [] });
  await assert.rejects(runPurge({ site: site(root), flags: { apply: true }, fetchImpl: noZone, ...quiet }), /Unable to resolve zone/);
});
