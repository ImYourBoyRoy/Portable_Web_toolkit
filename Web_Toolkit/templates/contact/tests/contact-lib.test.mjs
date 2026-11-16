// ./Web_Toolkit/templates/contact/tests/contact-lib.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACT_LIMITS,
  HONEYPOT_FIELD,
  TURNSTILE_VERIFY_URL,
  buildHtml,
  buildResultPage,
  buildSubject,
  buildText,
  cleanMultiline,
  cleanSingleLine,
  clientIp,
  createMemoryLimiter,
  decideRateLimit,
  escapeHtml,
  isAllowedOrigin,
  isLocalHostname,
  isTurnstileTestSecret,
  isTurnstileTestSiteKey,
  isValidEmail,
  parseContactInput,
  resolveContactConfig,
  safeReturnPath,
  verifyTurnstile,
  wantsJson,
  FIELD_ERRORS,
  checkFillTime
} from '../lib/contact-lib.ts';

const good = { name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello, I would like to talk about a project.' };

/* ------------------------------------------------------------ validation */

test('a complete submission validates and is trimmed', () => {
  const r = parseContactInput({ ...good, name: '  Ada   Lovelace ', inquiryType: '' });
  assert.equal(r.kind, 'valid');
  assert.deepEqual(r.submission, { name: 'Ada Lovelace', email: 'ada@example.com', inquiryType: '', message: good.message });
  assert.equal(r.turnstileToken, '');
  assert.equal(r.returnTo, null);
});

test('required fields report field-level errors', () => {
  const r = parseContactInput({});
  assert.equal(r.kind, 'invalid');
  assert.deepEqual(Object.keys(r.errors).sort(), ['email', 'message', 'name']);
  assert.equal(r.errors.name, FIELD_ERRORS.nameRequired);
});

test('non-string values are treated as empty, never coerced', () => {
  const r = parseContactInput({ name: ['a'], email: { toString: () => 'a@example.com' }, message: 42 });
  assert.equal(r.kind, 'invalid');
  assert.deepEqual(Object.keys(r.errors).sort(), ['email', 'message', 'name']);
});

test('email validation accepts normal addresses and rejects malformed ones', () => {
  for (const ok of ['a@example.com', 'first.last+tag@example.org', "o'brien@example.net", 'x_y-z@example.com']) {
    assert.equal(isValidEmail(ok), true, ok);
  }
  for (const bad of [
    '',
    'plain',
    '@example.com',
    'a@',
    'a@b',
    'a b@example.com',
    'a@exa mple.com',
    'a@@example.com',
    'a..b@example.com',
    '.a@example.com',
    'a.@example.com',
    'a@-bad.test',
    'a@bad-.test',
    'a@example.com,c@example.net',
    'Name <a@example.com>',
    '"a"@example.com',
    `${'x'.repeat(65)}@example.com`,
    `a@${'x'.repeat(250)}.com`
  ]) {
    assert.equal(isValidEmail(bad), false, bad);
  }
});

test('length limits are enforced instead of silently truncated', () => {
  const longName = parseContactInput({ ...good, name: 'n'.repeat(CONTACT_LIMITS.name + 1) });
  assert.equal(longName.errors.name, FIELD_ERRORS.nameLong);
  const longMsg = parseContactInput({ ...good, message: 'm'.repeat(CONTACT_LIMITS.message + 1) });
  assert.equal(longMsg.errors.message, FIELD_ERRORS.messageLong);
  const edge = parseContactInput({ ...good, message: 'm'.repeat(CONTACT_LIMITS.message) });
  assert.equal(edge.kind, 'valid');
});

test('message minimum length and link limit', () => {
  assert.equal(parseContactInput({ ...good, message: 'too short' }).errors.message, FIELD_ERRORS.messageShort);
  const links = 'See http://a.example http://b.example https://c.example www.d.example for details please.';
  assert.equal(parseContactInput({ ...good, message: links }).errors.message, FIELD_ERRORS.messageLinks);
  assert.equal(parseContactInput({ ...good, message: links }, { maxLinks: 4 }).kind, 'valid');
  assert.equal(parseContactInput({ ...good, message: 'tiny' }, { minMessageLength: 2 }).kind, 'valid');
});

test('inquiry type: allow-list when configured, free single line otherwise', () => {
  const rules = { inquiryTypes: ['Booking', 'Press'] };
  assert.equal(parseContactInput({ ...good, inquiryType: 'Booking' }, rules).submission.inquiryType, 'Booking');
  assert.equal(parseContactInput({ ...good, inquiryType: '' }, rules).kind, 'valid');
  assert.equal(parseContactInput({ ...good, inquiryType: 'Hacking' }, rules).errors.inquiryType, FIELD_ERRORS.inquiryInvalid);
  assert.equal(parseContactInput({ ...good, 'inquiry-type': 'Press' }, rules).submission.inquiryType, 'Press');
  assert.equal(parseContactInput({ ...good, inquiryType: 'Anything' }).submission.inquiryType, 'Anything');
});

test('message keeps its paragraphs but loses control characters and runaway blank lines', () => {
  const m = cleanMultiline('Line one\r\n\r\n\r\n\r\nLine\u0000 two\u0007\ttabbed  \n', 500);
  assert.equal(m, 'Line one\n\nLine two\ttabbed');
});

test('bidirectional override characters are stripped', () => {
  assert.equal(cleanSingleLine('evil\u202Egnp.exe', 50), 'evilgnp.exe');
  assert.equal(cleanMultiline('a\u2066b', 50), 'ab');
});

/* ------------------------------------------------------- header injection */

test('newlines in single-line fields can never survive into headers', () => {
  const attempts = [
    'Bob\r\nBcc: evil@example.com',
    'Bob\nBcc: evil@example.com',
    'Bob\rBcc: evil@example.com',
    'Bob\u2028Bcc: evil@example.com',
    'Bob%0d%0aBcc: evil@example.com'.replace('%0d%0a', '\r\n')
  ];
  for (const name of attempts) {
    const r = parseContactInput({ ...good, name });
    assert.equal(r.kind, 'valid');
    assert.ok(!/[\r\n\u2028\u2029]/.test(r.submission.name), JSON.stringify(r.submission.name));
    const subject = buildSubject('[Site]', 'General', r.submission.name);
    assert.ok(!/[\r\n]/.test(subject));
  }
});

test('an email carrying a header-injection payload is rejected, not sanitised into something deliverable', () => {
  for (const email of ['a@example.com\r\nBcc: x@example.org', 'a@example.com\nCc: x@example.org', 'a@example.com%0d%0aBcc:x@example.org'.replace('%0d%0a', '\r\n'), 'a@example.com, c@example.net']) {
    const r = parseContactInput({ ...good, email });
    assert.equal(r.kind, 'invalid', JSON.stringify(email));
    assert.equal(r.errors.email, FIELD_ERRORS.emailInvalid);
  }
});

test('inquiry type injection is neutralised or rejected', () => {
  const r = parseContactInput({ ...good, inquiryType: 'Press\r\nBcc: x@example.org' });
  assert.equal(r.kind, 'valid');
  assert.ok(!/[\r\n]/.test(r.submission.inquiryType));
  const strict = parseContactInput({ ...good, inquiryType: 'Press\r\nBcc: x@example.org' }, { inquiryTypes: ['Press'] });
  assert.equal(strict.kind, 'invalid');
});

test('buildSubject is one capped line with a sensible default', () => {
  const s = buildSubject('[Acme]', '', 'Ada');
  assert.equal(s, '[Acme] General inquiry from Ada');
  const long = buildSubject('[Acme]', 'x'.repeat(200), 'n'.repeat(500));
  assert.ok(long.length <= CONTACT_LIMITS.subject);
  assert.ok(!/[\r\n]/.test(buildSubject('[A]\r\nBcc: x', 'q\nz', 'n\r')));
});

/* --------------------------------------------------------------- honeypot */

test('a filled honeypot short-circuits before any validation', () => {
  assert.equal(parseContactInput({ ...good, [HONEYPOT_FIELD]: 'http://spam.example' }).kind, 'honeypot');
  assert.equal(parseContactInput({ [HONEYPOT_FIELD]: ' x ' }).kind, 'honeypot');
  assert.equal(parseContactInput({ ...good, [HONEYPOT_FIELD]: { a: 1 } }).kind, 'honeypot');
  assert.equal(parseContactInput({ ...good, [HONEYPOT_FIELD]: 0 }).kind, 'honeypot');
});

test('empty or absent honeypot values do not trigger', () => {
  assert.equal(parseContactInput({ ...good, [HONEYPOT_FIELD]: '' }).kind, 'valid');
  assert.equal(parseContactInput({ ...good, [HONEYPOT_FIELD]: '   ' }).kind, 'valid');
  assert.equal(parseContactInput({ ...good, [HONEYPOT_FIELD]: null }).kind, 'valid');
  assert.equal(parseContactInput({ ...good, [HONEYPOT_FIELD]: 'x' }, { honeypotField: 'other' }).kind, 'valid');
  assert.equal(parseContactInput({ ...good, other: 'x' }, { honeypotField: 'other' }).kind, 'honeypot');
});

/* ---------------------------------------------------------------- helpers */

test('token and returnTo are extracted; returnTo must be a same-site path', () => {
  const r = parseContactInput({ ...good, 'cf-turnstile-response': ' tok123 ', returnTo: '/contact/' });
  assert.equal(r.turnstileToken, 'tok123');
  assert.equal(r.returnTo, '/contact/');
  assert.equal(parseContactInput({ ...good, turnstileToken: 'alt' }).turnstileToken, 'alt');
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/a\r\nSet-Cookie: x', '', '/'.padEnd(250, 'a'), 5, null]) {
    assert.equal(safeReturnPath(bad), null, String(bad));
  }
  assert.equal(safeReturnPath('/contact/?x=1#y'), '/contact/?x=1#y');
});

test('origin and Sec-Fetch-Site gate', () => {
  const site = 'https://example.com';
  assert.equal(isAllowedOrigin({ origin: site }, site), true);
  assert.equal(isAllowedOrigin({}, site), true);
  assert.equal(isAllowedOrigin({ origin: 'https://evil.example' }, site), false);
  assert.equal(isAllowedOrigin({ origin: site, secFetchSite: 'cross-site' }, site), false);
  assert.equal(isAllowedOrigin({ origin: site, secFetchSite: 'same-origin' }, site), true);
});

test('wantsJson and clientIp', () => {
  assert.equal(wantsJson('application/json'), true);
  assert.equal(wantsJson('text/html,application/xhtml+xml'), false);
  assert.equal(wantsJson(null, 'application/json; charset=utf-8'), true);
  assert.equal(wantsJson(undefined), false);
  const headers = (v) => ({ get: (n) => (n === 'cf-connecting-ip' ? v : null) });
  assert.equal(clientIp(headers(' 203.0.113.9 ')), '203.0.113.9');
  assert.equal(clientIp(headers(null)), 'unknown');
  assert.equal(clientIp(headers('  ')), 'unknown');
});

test('message rendering escapes HTML and keeps line breaks', () => {
  const sub = { name: '<b>Ada</b>', email: 'a@example.com', inquiryType: '', message: 'Hi <script>alert(1)</script>\n"quoted" & more' };
  const html = buildHtml('Acme <Inc>', sub, '2026-11-16T10:00:00Z');
  assert.ok(!html.includes('<script>') && !html.includes('<b>Ada'));
  assert.ok(html.includes('&lt;script&gt;') && html.includes('<br>') && html.includes('&amp; more') && html.includes('Acme &lt;Inc&gt;'));
  assert.ok(html.includes('2026-11-16T10:00:00Z'));
  const text = buildText('Acme', sub);
  assert.ok(text.includes('Inquiry type: General inquiry') && text.includes(sub.message));
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});

test('result page escapes content and refuses unsafe back links', () => {
  const page = buildResultPage({ ok: false, message: '<img src=x onerror=alert(1)>', backHref: '//evil.example', siteName: 'A&B' });
  assert.ok(!page.includes('<img'));
  assert.ok(page.includes('href="/"'));
  assert.ok(page.includes('Message not sent') && page.includes('A&amp;B'));
  assert.ok(buildResultPage({ ok: true, message: 'ok', backHref: '/contact/', siteName: 'S' }).includes('Message sent'));
});

/* -------------------------------------------------------------- rate limit */

test('memory limiter blocks after the limit, reports Retry-After, and frees up after the window', () => {
  let now = 1_000_000;
  const l = createMemoryLimiter({ limit: 3, windowMs: 60_000, now: () => now });
  assert.equal(l.hit('a').allowed, true);
  now += 1000;
  assert.equal(l.hit('a').allowed, true);
  now += 1000;
  assert.equal(l.hit('a').allowed, true);
  now += 1000;
  const blocked = l.hit('a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfter, 57);
  assert.equal(l.hit('b').allowed, true, 'other keys are independent');
  now += 57_000;
  assert.equal(l.hit('a').allowed, true);
});

test('blocked attempts do not extend the window', () => {
  let now = 0;
  const l = createMemoryLimiter({ limit: 1, windowMs: 10_000, now: () => now });
  l.hit('k');
  for (let i = 0; i < 5; i += 1) {
    now += 1000;
    assert.equal(l.hit('k').allowed, false);
  }
  now = 10_001;
  assert.equal(l.hit('k').allowed, true);
});

test('memory limiter stays bounded', () => {
  let now = 0;
  const l = createMemoryLimiter({ limit: 5, windowMs: 1000, maxKeys: 10, now: () => now });
  for (let i = 0; i < 200; i += 1) {
    now += 1;
    assert.equal(l.hit(`ip-${i}`).allowed, true);
  }
  now += 5000;
  assert.equal(l.hit('fresh').allowed, true);
});

const binding = (impl) => ({ limit: async (o) => impl(o) });

test('decideRateLimit: binding blocks, allows, and errors fall through', async () => {
  const keys = [];
  const open = binding((o) => (keys.push(o.key), { success: true }));
  assert.deepEqual(await decideRateLimit({ ip: '1.1.1.1', binding: open }), { allowed: true, retryAfter: 0, via: 'binding' });
  assert.deepEqual(keys, ['contact:1.1.1.1']);

  const closed = binding(() => ({ success: false }));
  assert.deepEqual(await decideRateLimit({ ip: '1.1.1.1', binding: closed, bindingPeriodSeconds: 30 }), { allowed: false, retryAfter: 30, via: 'binding' });
  assert.equal((await decideRateLimit({ ip: '1.1.1.1', binding: closed })).retryAfter, 60);

  const broken = { limit: async () => { throw new Error('binding down'); } };
  assert.equal((await decideRateLimit({ ip: '1.1.1.1', binding: broken })).allowed, true);
});

test('decideRateLimit: no binding and no fallback allows (Turnstile still gates), fallback enforces', async () => {
  assert.deepEqual(await decideRateLimit({ ip: 'x' }), { allowed: true, retryAfter: 0, via: 'none' });
  assert.deepEqual(await decideRateLimit({ ip: 'x', binding: null, fallback: null }), { allowed: true, retryAfter: 0, via: 'none' });
  const fallback = createMemoryLimiter({ limit: 1, windowMs: 60_000 });
  assert.equal((await decideRateLimit({ ip: 'x', fallback })).allowed, true);
  const second = await decideRateLimit({ ip: 'x', fallback, group: 'g' });
  assert.equal(second.allowed, true, 'different group is a different key');
  const third = await decideRateLimit({ ip: 'x', fallback });
  assert.equal(third.allowed, false);
  assert.equal(third.via, 'memory');
  assert.ok(third.retryAfter >= 1);
});

test('decideRateLimit: both layers apply, and a broken binding still hits the fallback', async () => {
  const fallback = createMemoryLimiter({ limit: 1, windowMs: 60_000 });
  const open = binding(() => ({ success: true }));
  assert.equal((await decideRateLimit({ ip: 'y', binding: open, fallback })).allowed, true);
  const blocked = await decideRateLimit({ ip: 'y', binding: open, fallback });
  assert.deepEqual([blocked.allowed, blocked.via], [false, 'memory']);

  const broken = { limit: async () => { throw new Error('down'); } };
  const f2 = createMemoryLimiter({ limit: 1, windowMs: 60_000 });
  await decideRateLimit({ ip: 'z', binding: broken, fallback: f2 });
  assert.equal((await decideRateLimit({ ip: 'z', binding: broken, fallback: f2 })).allowed, false);
});

/* --------------------------------------------------------------- Turnstile */

function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fetchImpl, calls };
}

const reply = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const SECRET = '0x4AAAAAAAreal-secret';

test('turnstile success posts the documented siteverify payload', async () => {
  const { fetchImpl, calls } = fakeFetch(() => reply({ success: true, action: 'contact', hostname: 'Example.com' }));
  const v = await verifyTurnstile({
    secret: SECRET,
    token: 'tok',
    remoteIp: '203.0.113.5',
    expectedAction: 'contact',
    expectedHostname: 'example.com',
    fetchImpl
  });
  assert.deepEqual(v, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TURNSTILE_VERIFY_URL);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { secret: SECRET, response: 'tok', remoteip: '203.0.113.5' });
  assert.ok(calls[0].init.signal, 'request carries an abort signal for the timeout');
});

test('turnstile omits remoteip when unknown', async () => {
  const { fetchImpl, calls } = fakeFetch(() => reply({ success: true }));
  await verifyTurnstile({ secret: SECRET, token: 't', fetchImpl });
  assert.deepEqual(JSON.parse(calls[0].init.body), { secret: SECRET, response: 't' });
});

test('turnstile failure: missing secret or token never reaches the network', async () => {
  const { fetchImpl, calls } = fakeFetch(() => reply({ success: true }));
  assert.deepEqual(await verifyTurnstile({ secret: ' ', token: 't', fetchImpl }), { ok: false, reason: 'not-configured' });
  assert.deepEqual(await verifyTurnstile({ secret: SECRET, token: '  ', fetchImpl }), { ok: false, reason: 'missing-token' });
  assert.equal(calls.length, 0);
});

test('turnstile failure: rejected tokens surface error codes', async () => {
  const { fetchImpl } = fakeFetch(() => reply({ success: false, 'error-codes': ['invalid-input-response', 7] }));
  assert.deepEqual(await verifyTurnstile({ secret: SECRET, token: 't', fetchImpl }), {
    ok: false,
    reason: 'rejected',
    codes: ['invalid-input-response']
  });
  const truthy = fakeFetch(() => reply({ success: 'true' }));
  assert.equal((await verifyTurnstile({ secret: SECRET, token: 't', fetchImpl: truthy.fetchImpl })).reason, 'rejected');
});

test('turnstile failure: action and hostname mismatches on real keys', async () => {
  const wrongAction = fakeFetch(() => reply({ success: true, action: 'login', hostname: 'example.com' }));
  assert.equal(
    (await verifyTurnstile({ secret: SECRET, token: 't', expectedAction: 'contact', fetchImpl: wrongAction.fetchImpl })).reason,
    'action-mismatch'
  );
  const noAction = fakeFetch(() => reply({ success: true, hostname: 'example.com' }));
  assert.equal(
    (await verifyTurnstile({ secret: SECRET, token: 't', expectedAction: 'contact', fetchImpl: noAction.fetchImpl })).reason,
    'action-mismatch'
  );
  const wrongHost = fakeFetch(() => reply({ success: true, action: 'contact', hostname: 'evil.example' }));
  assert.equal(
    (await verifyTurnstile({ secret: SECRET, token: 't', expectedHostname: ['example.com', 'www.example.com'], fetchImpl: wrongHost.fetchImpl })).reason,
    'hostname-mismatch'
  );
  const www = fakeFetch(() => reply({ success: true, hostname: 'WWW.example.com' }));
  assert.equal(
    (await verifyTurnstile({ secret: SECRET, token: 't', expectedHostname: ['example.com', 'www.example.com'], fetchImpl: www.fetchImpl })).ok,
    true
  );
});

test('turnstile test secrets skip action/hostname matching (placeholder values) but still need success', async () => {
  const testSecret = '1x0000000000000000000000000000000AA';
  assert.equal(isTurnstileTestSecret(testSecret), true);
  const ok = fakeFetch(() => reply({ success: true, action: '', hostname: 'example.com' }));
  assert.equal((await verifyTurnstile({ secret: testSecret, token: 't', expectedAction: 'contact', expectedHostname: 'localhost', fetchImpl: ok.fetchImpl })).ok, true);
  const no = fakeFetch(() => reply({ success: false, 'error-codes': ['invalid-input-response'] }));
  assert.equal((await verifyTurnstile({ secret: '2x0000000000000000000000000000000AA', token: 't', fetchImpl: no.fetchImpl })).ok, false);
});

test('turnstile network problems become "unavailable" and never throw', async () => {
  const cases = [
    () => { throw new TypeError('fetch failed'); },
    () => reply({}, false, 500),
    () => reply({}, false, 403),
    () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }),
    () => reply(null),
    () => reply('nope')
  ];
  for (const handler of cases) {
    const { fetchImpl } = fakeFetch(handler);
    assert.deepEqual(await verifyTurnstile({ secret: SECRET, token: 't', fetchImpl }), { ok: false, reason: 'unavailable' });
  }
});

test('turnstile timeout aborts a hanging request', async () => {
  const hanging = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  const started = Date.now();
  const v = await verifyTurnstile({ secret: SECRET, token: 't', fetchImpl: hanging, timeoutMs: 20 });
  assert.deepEqual(v, { ok: false, reason: 'unavailable' });
  assert.ok(Date.now() - started < 1000);
});

test('turnstile test-key detection', () => {
  for (const k of ['1x00000000000000000000AA', '2x00000000000000000000AB', '3x00000000000000000000FF']) assert.equal(isTurnstileTestSiteKey(k), true, k);
  assert.equal(isTurnstileTestSiteKey('0x4AAAAAAABkMYinukE8nzYS'), false);
  assert.equal(isTurnstileTestSecret('0x4AAAAAAAreal'), false);
  assert.equal(isLocalHostname('localhost'), true);
  assert.equal(isLocalHostname('app.localhost'), true);
  assert.equal(isLocalHostname('example.com'), false);
  assert.equal(isLocalHostname('localhost.evil.com'), false);
});

/* ------------------------------------------------------------------ config */

test('resolveContactConfig applies safe defaults and sanitises input', () => {
  const d = resolveContactConfig(undefined);
  assert.deepEqual(d, {
    siteName: 'Website',
    subjectPrefix: '[Website]',
    inquiryTypes: [],
    minMessageLength: 10,
    maxLinks: 3,
    turnstileMode: 'required',
    minFillMs: 2500,
    fallbackEmail: '',
    defaultReturnPath: '/contact/',
    extraFields: [],
    memoryLimit: { limit: 5, windowMs: 600_000 }
  });
  const c = resolveContactConfig({
    siteName: 'Acme\r\nBcc: x',
    inquiryTypes: ['Sales', 'Sales', '', 5, 'Press'],
    minMessageLength: -3,
    maxLinks: 'many',
    turnstile: { mode: 'optional' },
    fallbackEmail: 'hello@acme.example',
    defaultReturnPath: 'https://evil.example',
    rateLimit: { memory: { limit: 2, windowMinutes: 1 } }
  });
  assert.equal(c.siteName, 'Acme Bcc: x');
  assert.deepEqual(c.inquiryTypes, ['Sales', 'Press']);
  assert.equal(c.minMessageLength, 10);
  assert.equal(c.maxLinks, 3);
  assert.equal(c.turnstileMode, 'optional');
  assert.equal(c.fallbackEmail, 'hello@acme.example');
  assert.equal(c.defaultReturnPath, '/contact/');
  assert.deepEqual(c.memoryLimit, { limit: 2, windowMs: 60_000 });
  assert.equal(resolveContactConfig({ rateLimit: { memory: false } }).memoryLimit, null);
  assert.equal(resolveContactConfig({ rateLimit: { memory: { limit: 0 } } }).memoryLimit, null);
  assert.equal(resolveContactConfig({ fallbackEmail: 'not an email' }).fallbackEmail, '');
  assert.equal(resolveContactConfig('garbage').siteName, 'Website');
});

test('time trap: absent passes (no JavaScript), a present value under the minimum or garbage fails, 0 disables', () => {
  assert.deepEqual(checkFillTime(undefined, 2500), { ok: true, elapsedMs: null });
  assert.deepEqual(checkFillTime('', 2500), { ok: true, elapsedMs: null });
  assert.equal(checkFillTime('300', 2500).ok, false);
  assert.equal(checkFillTime('abc', 2500).ok, false);
  assert.equal(checkFillTime('2500', 2500).ok, true);
  assert.equal(checkFillTime('10', 0).ok, true);
});

test('turnstile mode "off" and minFillMs are configurable; unknown modes stay fail-closed "required"', () => {
  assert.equal(resolveContactConfig({ turnstile: { mode: 'off' } }).turnstileMode, 'off');
  assert.equal(resolveContactConfig({ turnstile: { mode: 'nonsense' } }).turnstileMode, 'required');
  assert.equal(resolveContactConfig({ minFillMs: 0 }).minFillMs, 0);
  assert.equal(resolveContactConfig({ minFillMs: 'fast' }).minFillMs, 2500);
});

test('parse carries a well-formed client submission id and the raw elapsed value; subject, text and html include the id', () => {
  const parsed = parseContactInput({ name: 'Ada', email: 'ada@example.com', message: 'Hello there, friend.', submission_id: 'inq-abcdef123456', form_elapsed: '4000' });
  assert.equal(parsed.kind, 'valid');
  assert.equal(parsed.submissionId, 'inq-abcdef123456');
  assert.equal(parsed.elapsedRaw, '4000');
  const bad = parseContactInput({ name: 'Ada', email: 'ada@example.com', message: 'Hello there, friend.', submission_id: 'x y\nBcc: z' });
  assert.equal(bad.submissionId, null);
  assert.equal(bad.elapsedRaw, undefined);
  const subject = buildSubject('[Acme]', 'Press', 'Ada', 'inq-abcdef123456');
  assert.ok(subject.includes('inq-abcdef123456') && !/[\r\n]/.test(subject));
  assert.ok(buildText('Acme', parsed.submission, undefined, 'inq-abcdef123456').includes('Reference: inq-abcdef123456'));
  assert.ok(buildHtml('Acme', { ...parsed.submission, name: '<b>x</b>' }, undefined, 'inq-abcdef123456').includes('Reference'));
  assert.ok(!buildHtml('Acme', { ...parsed.submission, name: '<b>x</b>' }).includes('<b>x'));
});

test('unexpectedFields: only declared names pass, extraFields extends the list, names are never required to be echoed', async () => {
  const { unexpectedFields, CONTACT_FIELDS, resolveContactConfig } = await import('../lib/contact-lib.ts');
  const body = { name: 'A', email: 'a@example.com', message: 'hello there', company_url: '', form_elapsed: '9000', 'cf-turnstile-response': 'x', returnTo: '/contact/' };
  assert.deepEqual(unexpectedFields(body), []);
  assert.deepEqual(unexpectedFields({ ...body, role: 'admin' }), ['role']);
  assert.deepEqual(unexpectedFields({ ...body, phone: '1' }, ['phone']), []);
  assert.ok(CONTACT_FIELDS.includes('inquiryType'));
  assert.deepEqual(resolveContactConfig({ extraFields: ['phone', 'bad name', 'phone', 7] }).extraFields, ['phone']);
  assert.deepEqual(resolveContactConfig({}).extraFields, []);
});
