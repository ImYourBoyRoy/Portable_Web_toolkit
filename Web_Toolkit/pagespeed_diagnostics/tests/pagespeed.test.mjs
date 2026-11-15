// ./Web_Toolkit/pagespeed_diagnostics/tests/pagespeed.test.mjs
/**
 * Offline tests for PageSpeed request handling, strict thresholds, and missing-metric failures.
 * Run: node --test ./Web_Toolkit/pagespeed_diagnostics/tests/
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { requestPageSpeed, summarizeOne } from '../src/commands/run.mjs';
import { defaultThresholds, parseThreshold, thresholdIssues } from '../src/commands/agent-batch.mjs';

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('requestPageSpeed returns the payload on success and sends the key only in the request URL', async () => {
  let seen;
  const payload = await requestPageSpeed('https://example.com/', 'mobile', 'SECRET-KEY', {
    fetchImpl: async (endpoint) => {
      seen = String(endpoint);
      return jsonResponse({ lighthouseResult: {} });
    },
  });
  assert.deepEqual(payload, { lighthouseResult: {} });
  assert.ok(seen.includes('strategy=mobile'));
});

test('requestPageSpeed throws on HTTP errors with the API message and never leaks the key', async () => {
  await assert.rejects(
    requestPageSpeed('https://example.com/', 'mobile', 'SECRET-KEY', {
      fetchImpl: async () => jsonResponse({ error: { message: 'Quota exceeded' } }, 429),
    }),
    (error) => {
      assert.match(error.message, /HTTP 429/);
      assert.match(error.message, /Quota exceeded/);
      assert.ok(!error.message.includes('SECRET-KEY'));
      return true;
    },
  );
});

test('requestPageSpeed throws on a non-JSON body and on network failure', async () => {
  await assert.rejects(
    requestPageSpeed('https://example.com/', 'desktop', '', {
      fetchImpl: async () => ({ ok: false, status: 502, json: async () => { throw new Error('bad json'); } }),
    }),
    /non-JSON response \(HTTP 502\)/,
  );
  await assert.rejects(
    requestPageSpeed('https://example.com/', 'desktop', '', {
      fetchImpl: async () => { throw new TypeError('fetch failed'); },
    }),
    /failed: fetch failed/,
  );
});

test('requestPageSpeed reports a timeout instead of hanging', async () => {
  await assert.rejects(
    requestPageSpeed('https://example.com/', 'mobile', '', {
      timeoutMs: 20,
      fetchImpl: (_endpoint, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      }),
    }),
    /timed out/,
  );
});

test('parseThreshold rejects typos, bare flags, and negatives instead of passing everything', () => {
  assert.equal(parseThreshold('min-score', undefined, 1), 1);
  assert.equal(parseThreshold('min-score', '0.9', 1), 0.9);
  assert.throws(() => parseThreshold('min-score', 'abc', 1), /Invalid --min-score/);
  assert.throws(() => parseThreshold('min-score', true, 1), /Invalid --min-score/);
  assert.throws(() => parseThreshold('max-lcp-ms', '-5', 2500), /Invalid --max-lcp-ms/);
  assert.throws(() => defaultThresholds({}, { 'max-tbt-ms': 'fast' }), /Invalid --max-tbt-ms/);
});

test('a payload missing metric audits is flagged, not read as zero', () => {
  const summary = summarizeOne('mobile', { lighthouseResult: { audits: {}, categories: {} } });
  assert.deepEqual([...summary.missingMetrics].sort(), ['cls', 'fcpMs', 'lcpMs', 'speedIndexMs', 'tbtMs']);
  const issues = thresholdIssues('https://example.com/', 'mobile', summary, defaultThresholds({}, {}));
  assert.equal(issues.filter((issue) => issue.code.endsWith('-missing')).length, 5);
  assert.ok(issues.every((issue) => issue.severity === 'fail'));
});

test('a fully reported payload within targets raises no metric issues', () => {
  const audits = {
    'speed-index': { numericValue: 1000 },
    'first-contentful-paint': { numericValue: 900 },
    'largest-contentful-paint': { numericValue: 1200 },
    'total-blocking-time': { numericValue: 50 },
    'cumulative-layout-shift': { numericValue: 0 },
  };
  const summary = summarizeOne('mobile', { lighthouseResult: { audits, categories: {} } });
  assert.deepEqual(summary.missingMetrics, []);
  assert.deepEqual(thresholdIssues('https://example.com/', 'mobile', summary, defaultThresholds({}, {})), []);
});

test('an over-threshold metric still fails', () => {
  const audits = {
    'speed-index': { numericValue: 1000 },
    'first-contentful-paint': { numericValue: 900 },
    'largest-contentful-paint': { numericValue: 9000 },
    'total-blocking-time': { numericValue: 50 },
    'cumulative-layout-shift': { numericValue: 0 },
  };
  const summary = summarizeOne('mobile', { lighthouseResult: { audits, categories: {} } });
  const issues = thresholdIssues('https://example.com/', 'mobile', summary, defaultThresholds({}, {}));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'metric-lcp-over-threshold');
});
