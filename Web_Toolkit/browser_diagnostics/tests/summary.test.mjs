// ./Web_Toolkit/browser_diagnostics/tests/summary.test.mjs
/**
 * Offline tests for browser-diagnostics summarizing.
 * Run: node --test ./tests/summary.test.mjs
 * Covers: HTTP errors, navigation errors, empty route lists, dev-host severity.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeReport } from '../src/lib/summary.mjs';

const okRoute = (path = '/') => ({ path, status: 200, ok: true, error: '', metrics: { loadMs: 100 }, console: { errorCount: 0 }, pageErrors: [], network: { blockingFailures: [], ignoredFailures: [] } });
const host = (routes) => ({ host: 'example.com', thresholds: {}, routes });

test('clean production run passes', () => {
  const summary = summarizeReport({ python: { ok: true }, production: host([okRoute()]) });
  assert.equal(summary.overall, 'pass');
});

test('production 404 and 500 routes fail', () => {
  const summary = summarizeReport({ python: { ok: true }, production: host([okRoute(), { ...okRoute('/missing'), status: 404, ok: false }, { ...okRoute('/boom'), status: 500, ok: false }]) });
  assert.equal(summary.overall, 'fail');
  assert.match(summary.failures[0], /\/missing \(HTTP 404\).*\/boom \(HTTP 500\)/);
});

test('navigation timeout fails even with status 0 and no other signals', () => {
  const summary = summarizeReport({ python: { ok: true }, production: host([{ ...okRoute('/slow'), status: 0, ok: false, error: 'Timeout 20000ms exceeded' }]) });
  assert.equal(summary.overall, 'fail');
  assert.match(summary.failures[0], /Timeout/);
});

test('zero routes checked fails', () => {
  assert.equal(summarizeReport({ python: { ok: true }, production: host([]) }).overall, 'fail');
});

test('unhealthy python runtime fails', () => {
  const summary = summarizeReport({ python: { ok: false, error: 'boom' }, production: null });
  assert.equal(summary.overall, 'fail');
  assert.equal(summary.failures.length, 1);
});

test('development host route errors only warn', () => {
  const summary = summarizeReport({ python: { ok: true }, production: host([okRoute()]), development: host([{ ...okRoute('/x'), status: 404, ok: false }]) });
  assert.equal(summary.overall, 'warn');
});
