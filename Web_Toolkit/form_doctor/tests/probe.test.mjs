import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { assertLoopback, buildPayloadFromHtml, runProbes } from '../src/probe.mjs';

const PAGE = (method) => `<!doctype html><form ${method} action="/api/contact" id="c">
  <input name="website_confirm" class="hp-field" tabindex="-1">
  <input type="hidden" name="submission_id" value="">
  <input type="hidden" name="form_elapsed" value="">
  <input name="name" required><input type="email" name="email" required>
  <select name="topic"><option value="" disabled selected>Pick</option><option value="a">A</option><option value="b">B</option></select>
  <textarea name="message"></textarea><input type="checkbox" name="agree" value="1">
  <button type="submit">Send</button></form>`;

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

/** The pre-fix behaviour: every POST and even GET answers 200, the failed send is swallowed. */
const lossy = (req, res) => {
  if (req.url.startsWith('/inquire')) return res.end(PAGE(''));
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"message":"Success"}');
};

/** The fixed behaviour with a broken mail binding. */
const honest = (status) => async (req, res) => {
  if (req.url.startsWith('/inquire')) return res.end(PAGE('method="post"'));
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' });
    return res.end('{"ok":false}');
  }
  if (req.headers.origin) {
    res.writeHead(403);
    return res.end('{"ok":false}');
  }
  const text = await body(req);
  if (text.length > 65536) {
    res.writeHead(413);
    return res.end('{"ok":false}');
  }
  if (text.includes('__form_doctor_unexpected__')) {
    res.writeHead(400);
    return res.end('{"ok":false}');
  }
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end('{"ok":false,"error":"Your inquiry could not be sent right now."}');
};

const byId = (results) => Object.fromEntries(results.map((r) => [r.id, r]));

test('payload builder reads the served form, skips honeypots, files and checkboxes, picks the first real option', () => {
  const fields = Object.fromEntries(buildPayloadFromHtml(PAGE('method="post"')));
  assert.equal(fields.name, 'FormDoctor Probe');
  assert.equal(fields.email, 'form-doctor@example.invalid');
  assert.equal(fields.topic, 'a');
  assert.ok(fields.message.includes('form-doctor probe'));
  assert.ok(!('website_confirm' in fields) && !('agree' in fields) && !('form_elapsed' in fields));
  assert.equal(buildPayloadFromHtml('<p>no form</p>'), null);
});

test('the probe only talks to loopback', async () => {
  assert.doesNotThrow(() => assertLoopback('http://127.0.0.1:8787'));
  assert.doesNotThrow(() => assertLoopback('http://localhost:4321'));
  assert.throws(() => assertLoopback('https://imyourboyroy.com'), /loopback/);
  await assert.rejects(() => runProbes({ baseUrl: 'https://example.com', endpoint: '/x', formPage: '/c/' }), /loopback/);
});

test('a lossy form (GET accepted, 200 for everything, no method) fails every probe that matters', async () => {
  const { server, baseUrl } = await serve(lossy);
  try {
    const { results } = await runProbes({ baseUrl, endpoint: '/api/contact', formPage: '/inquire/', mail: 'missing' });
    const r = byId(results);
    assert.equal(r['form-method'].status, 'fail');
    assert.equal(r['get-no-data'].status, 'fail');
    assert.equal(r.oversize.status, 'fail');
    assert.equal(r['unexpected-field'].status, 'fail');
    assert.equal(r['mail-missing'].status, 'fail');
    assert.match(r['mail-missing'].detail, /silent lead loss/);
  } finally {
    server.close();
  }
});

test('an honest form passes with a missing (503) and a rejected (502) mail binding', async () => {
  for (const [mail, status, id] of [['missing', 503, 'mail-missing'], ['rejected', 502, 'mail-rejected']]) {
    const { server, baseUrl } = await serve(honest(status));
    try {
      const { results } = await runProbes({ baseUrl, endpoint: '/api/contact', formPage: '/inquire/', mail });
      const r = byId(results);
      for (const key of ['form-method', 'get-no-data', 'oversize', 'unexpected-field', 'cross-site', id, 'no-leak']) assert.equal(r[key].status, 'pass', `${key}: ${r[key]?.detail}`);
    } finally {
      server.close();
    }
  }
});

test('without a broken-binding server the send probe is skipped as INFO, never guessed', async () => {
  const { server, baseUrl } = await serve(honest(503));
  try {
    const { results } = await runProbes({ baseUrl, endpoint: '/api/contact', formPage: '/inquire/' });
    assert.equal(byId(results)['mail-failure'].status, 'info');
  } finally {
    server.close();
  }
});

test('answers that leak stack traces or binding names fail the no-leak probe', async () => {
  const leaky = (req, res) => {
    if (req.url.startsWith('/inquire')) return res.end(PAGE('method="post"'));
    res.writeHead(500);
    res.end('TypeError: env.SEND_EMAIL is undefined\n    at handler (/app/node_modules/x.js:1:1)');
  };
  const { server, baseUrl } = await serve(leaky);
  try {
    const { results } = await runProbes({ baseUrl, endpoint: '/api/contact', formPage: '/inquire/' });
    assert.equal(byId(results)['no-leak'].status, 'fail');
  } finally {
    server.close();
  }
});

test('a missing form page fails closed', async () => {
  const { server, baseUrl } = await serve((req, res) => {
    res.writeHead(404);
    res.end();
  });
  try {
    const { results } = await runProbes({ baseUrl, endpoint: '/api/contact', formPage: '/nope/' });
    assert.equal(results[0].status, 'fail');
  } finally {
    server.close();
  }
});
