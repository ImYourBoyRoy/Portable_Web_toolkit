// The generic multi-field intake handler with a mocked mail binding. Same scenarios the site tests use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleIntake, methodNotAllowed } from '../lib/handle-intake.ts';
import { createMemoryLimiter } from '../lib/contact-lib.ts';
import { createRecentIds } from '../lib/intake-lib.ts';

const ORIGIN = 'https://example.test';
const URL_ = new URL(`${ORIGIN}/api/intake`);

const SCHEMA = {
  fields: [
    { name: 'name', label: 'Name', kind: 'line', section: 'Contact', required: true, max: 120 },
    { name: 'email', label: 'Email', kind: 'email', section: 'Contact', required: true },
    { name: 'topic', label: 'Topic', kind: 'select', section: 'Project', required: true, options: ['website', 'training'], optionLabels: { website: 'Website', training: 'Training' } },
    { name: 'message', label: 'Message', kind: 'text', section: 'Project', required: true, max: 3000 },
    { name: 'extras', label: 'Extras', kind: 'multi', section: 'Project', options: ['a', 'b', 'c'] }
  ],
  internal: { honeypot: 'website_confirm', elapsed: 'form_elapsed', submissionId: 'submission_id', turnstile: 'cf-turnstile-response' },
  maxEntries: 30
};
const CONFIG = {
  siteName: 'Example', subjectPrefix: 'Inquiry', recipient: 'owner@example.test', sender: 'forms@example.test', senderName: 'Example',
  fallbackEmail: 'owner@example.test', formPath: '/contact/', maxBodyBytes: 2048, minFillMs: 2500,
  rateLimit: { bindingPeriodSeconds: 60, memory: null }, duplicateTtlMs: 60_000, turnstile: { enabled: false, action: 'intake' },
  nameField: 'name', emailField: 'email', topicField: 'topic', topicLabels: { website: 'Website' }
};
const VALID = { name: 'Ada', email: 'ada@example.com', topic: 'website', message: 'Hello <b>there</b>', submission_id: 'inq-abcdef123456' };

function post(fields, { json = true, headers = {}, ip } = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) (Array.isArray(v) ? v : [v]).forEach((x) => body.append(k, x));
  return new Request(URL_, { method: 'POST', body: body.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, accept: json ? 'application/json' : 'text/html', ...(ip ? { 'cf-connecting-ip': ip } : {}), ...headers } });
}
function setup(over = {}) {
  const sent = [];
  const logs = [];
  const mail = 'mail' in over ? over.mail : { send: async (m) => { sent.push(m); } };
  const config = { ...CONFIG, ...(over.config ?? {}) };
  return { sent, logs, deps: { bindings: { mail, rateLimit: over.rateLimit, turnstileSecret: over.secret }, config, schema: SCHEMA, recentIds: createRecentIds({ ttlMs: 60_000 }), memoryLimiter: over.memoryLimiter ?? null, fetchImpl: over.fetchImpl, log: (level, entry) => logs.push({ level, entry }) } };
}
const json = async (r) => JSON.parse(await r.text());

test('success only after the provider accepted; Reply-To, id in subject, HTML escaped, no PII logged', async () => {
  const { deps, sent, logs } = setup();
  const r = await handleIntake(post({ ...VALID, extras: ['a', 'c'] }), URL_, deps);
  assert.equal(r.status, 200);
  assert.equal((await json(r)).id, VALID.submission_id);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].replyTo, 'ada@example.com');
  assert.ok(sent[0].subject.includes('inq-abcdef123456'));
  assert.ok(sent[0].html.includes('&lt;b&gt;there') && !sent[0].html.includes('<b>there'));
  assert.ok(sent[0].text.includes('Extras: a, c'));
  assert.doesNotMatch(JSON.stringify(logs), /Ada|ada@example|Hello/);
});

test('missing mail binding is 503, provider rejection is 502, never a success', async () => {
  const none = setup({ mail: undefined });
  const a = await handleIntake(post(VALID), URL_, none.deps);
  assert.equal(a.status, 503);
  const reject = setup({ mail: { send: async () => { throw Object.assign(new Error('secret detail owner@example.test'), { code: 'E_SENDER_NOT_VERIFIED' }); } } });
  const b = await handleIntake(post(VALID), URL_, reject.deps);
  assert.equal(b.status, 502);
  assert.doesNotMatch(await b.text(), /secret detail|E_SENDER|owner@/);
  assert.ok(JSON.stringify(reject.logs).includes('E_SENDER_NOT_VERIFIED'));
  assert.doesNotMatch(JSON.stringify(reject.logs), /secret detail|ada@/);
});

test('invalid 422, oversize 413 (declared and streamed), unexpected field 400, file 400', async () => {
  const { deps, sent } = setup();
  assert.equal((await handleIntake(post({ ...VALID, email: 'nope', topic: 'x' }), URL_, deps)).status, 422);
  assert.equal((await handleIntake(post(VALID, { headers: { 'content-length': '999999' } }), URL_, deps)).status, 413);
  const big = new Request(URL_, { method: 'POST', body: `message=${'a'.repeat(5000)}`, headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN } });
  assert.equal((await handleIntake(big, URL_, deps)).status, 413);
  assert.equal((await handleIntake(post({ ...VALID, role: 'admin' }), URL_, deps)).status, 400);
  const fd = new FormData();
  Object.entries(VALID).forEach(([k, v]) => fd.append(k, v));
  fd.set('message', new Blob(['x']), 'x.txt');
  assert.equal((await handleIntake(new Request(URL_, { method: 'POST', body: fd, headers: { origin: ORIGIN } }), URL_, deps)).status, 400);
  assert.equal(sent.length, 0);
});

test('honeypot is a neutral 200 without mail; time trap is 422; missing elapsed (no JavaScript) passes', async () => {
  const { deps, sent } = setup();
  assert.equal((await handleIntake(post({ ...VALID, website_confirm: 'x' }), URL_, deps)).status, 200);
  assert.equal(sent.length, 0);
  assert.equal((await handleIntake(post({ ...VALID, form_elapsed: '200' }), URL_, deps)).status, 422);
  assert.equal((await handleIntake(post({ ...VALID, form_elapsed: '9000' }), URL_, deps)).status, 200);
  assert.equal((await handleIntake(post({ ...VALID, submission_id: '' }, { json: false }), URL_, deps)).status, 200);
});

test('rate limit: binding refusal is 429 + Retry-After, a failing or missing binding does not block, memory window per IP', async () => {
  const blocked = setup({ rateLimit: { limit: async () => ({ success: false }) } });
  const r = await handleIntake(post(VALID), URL_, blocked.deps);
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '60');
  assert.equal((await handleIntake(post(VALID), URL_, setup({ rateLimit: { limit: async () => { throw new Error('x'); } } }).deps)).status, 200);
  assert.equal((await handleIntake(post(VALID), URL_, setup().deps)).status, 200);
  const memory = setup({ memoryLimiter: createMemoryLimiter({ limit: 1, windowMs: 60_000 }) });
  assert.equal((await handleIntake(post({ ...VALID, submission_id: 'inq-rate00000001' }, { ip: '203.0.113.1' }), URL_, memory.deps)).status, 200);
  assert.equal((await handleIntake(post({ ...VALID, submission_id: 'inq-rate00000002' }, { ip: '203.0.113.1' }), URL_, memory.deps)).status, 429);
});

test('duplicate id sends once; a failed send is not remembered; no-JS gets HTML with a mailto on failure', async () => {
  const { deps, sent } = setup();
  await handleIntake(post(VALID), URL_, deps);
  const again = await handleIntake(post(VALID), URL_, deps);
  assert.equal((await json(again)).duplicate, true);
  assert.equal(sent.length, 1);
  const bad = setup({ mail: { send: async () => { throw new Error('no'); } } });
  const page = await handleIntake(post(VALID, { json: false }), URL_, bad.deps);
  assert.equal(page.status, 502);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.ok((await page.text()).includes('mailto:owner@example.test'));
});

test('cross-site 403, wrong content type 415, GET-style methods 405, Turnstile off by default and fail-closed when on', async () => {
  const { deps } = setup();
  assert.equal((await handleIntake(post(VALID, { headers: { origin: 'https://evil.test' } }), URL_, deps)).status, 403);
  assert.equal((await handleIntake(new Request(URL_, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', origin: ORIGIN } }), URL_, deps)).status, 415);
  assert.equal(methodNotAllowed().status, 405);
  const on = { turnstile: { enabled: true, action: 'intake' } };
  assert.equal((await handleIntake(post(VALID), URL_, setup({ config: on }).deps)).status, 503);
  assert.equal((await handleIntake(post(VALID), URL_, setup({ config: on, secret: 'real' }).deps)).status, 400);
  const pass = setup({ config: on, secret: 'real', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ success: true, action: 'intake', hostname: 'example.test' }) }) });
  assert.equal((await handleIntake(post({ ...VALID, 'cf-turnstile-response': 't' }), URL_, pass.deps)).status, 200);
});
