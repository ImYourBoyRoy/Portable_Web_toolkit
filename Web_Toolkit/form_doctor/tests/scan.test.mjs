import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanProject, summarize } from '../src/scan.mjs';
import * as scanModule from '../src/scan.mjs';
import { matchBrace, stripComments } from '../src/analysis.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '../bin/form-doctor.mjs');

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'form-doctor-'));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return root;
}
const rules = (scan, severity) => scan.findings.filter((f) => !severity || f.severity === severity).map((f) => f.rule).sort();

const BAD_HANDLER = `
import { env } from 'cloudflare:workers';
export const POST = async ({ request }) => {
  try {
    const data = await request.formData();
    const allData = {};
    for (const [key, value] of data.entries()) allData[key] = String(value).replace(/<[^>]*>/g, '');
    console.log('Intake inquiry received from:', allData.name);
    const emailBody = Object.entries(allData).map(([k, v]) => k + ': ' + v).join('\\n');
    try {
      await env.SEND_EMAIL.send({ to: 'a@example.com', from: 'c@example.com', subject: 's', html: \`<pre>\${emailBody}</pre>\` });
    } catch (mailErr) {
      console.error('failed', mailErr);
      console.log(emailBody);
    }
    return new Response(JSON.stringify({ message: 'Success' }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ message: 'bad', error: err.message }), { status: 500 });
  }
};`;

const GOOD_HANDLER = `
import { env } from 'cloudflare:workers';
import { escapeHtml } from './escape';
const ALLOWED = new Set(['name', 'email', 'message']);
const MAX_BODY_BYTES = 32768;
export const POST = async ({ request }) => {
  if (request.headers.get('origin') !== 'https://x.test') return new Response('no', { status: 403 });
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return new Response('big', { status: 413 });
  const limited = await env.RATE_LIMIT.limit({ key: 'ip' });
  if (!limited.success) return new Response('slow', { status: 429, headers: { 'Retry-After': '60' } });
  const form = new URLSearchParams(text);
  for (const [key] of form.entries()) if (!ALLOWED.has(key)) return new Response('unexpected', { status: 400 });
  if (form.get('website_confirm')) return new Response('ok');
  try {
    await env.SEND_EMAIL.send({ to: 'a@example.com', from: 'c@example.com', subject: 's', html: \`<p>\${escapeHtml(form.get('message') ?? '')}</p>\` });
  } catch (error) {
    console.error('send failed', error instanceof Error ? error.name : 'unknown');
    return new Response('{"ok":false}', { status: 502 });
  }
  return new Response('{"ok":true}');
};`;

test('the old inquiry handler pattern trips every silent-failure rule', () => {
  const scan = scanProject(project({
    'src/pages/api/submit.ts': BAD_HANDLER,
    'src/pages/contact.astro': '<form id="f"><input name="email"></form>'
  }));
  const failed = new Set(rules(scan, 'fail'));
  for (const rule of ['swallowed-send-error', 'logs-payload', 'returns-error-message', 'no-body-cap', 'no-allowlist', 'unescaped-html-email', 'form-no-method']) {
    assert.ok(failed.has(rule), `expected ${rule}, got ${[...failed]}`);
  }
  assert.deepEqual(scan.handlers, ['src/pages/api/submit.ts']);
  assert.ok(summarize(scan.findings).fail >= 7);
});

test('a handler with honest statuses, caps, allowlist and escaping has no failures', () => {
  const scan = scanProject(project({
    'src/pages/api/submit.ts': GOOD_HANDLER,
    'src/pages/api/escape.ts': 'export const escapeHtml = (s) => s.replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;" })[c] ?? c);',
    'src/pages/contact.astro': '<form method="post" action="/api/submit"><input name="email"></form>'
  }));
  assert.deepEqual(rules(scan, 'fail'), [], JSON.stringify(scan.findings));
});

test('a thin route is judged together with the library it imports', () => {
  const scan = scanProject(project({
    'src/pages/api/submit.ts': "import { handle } from '../../lib/handle';\nexport const POST = ({ request }) => handle(request);",
    'src/lib/handle.ts': BAD_HANDLER.replace('export const POST', 'export const handle')
  }));
  assert.ok(rules(scan, 'fail').includes('swallowed-send-error'));
  assert.equal(scan.handlers.length, 1, 'the library is not reported a second time');
});

test('forms: missing method and non-search GET fail; search, client-only and external providers pass', () => {
  const scan = scanProject(project({
    'src/pages/a.astro': '<form><input name="q"></form>',
    'src/pages/b.astro': '<form method="get" action="/x"><input name="email"></form>',
    'src/pages/c.astro': '<form role="search"><input name="q"></form>',
    'src/pages/d.astro': '<form data-form-doctor="client-only"><input></form>',
    'src/pages/e.astro': '<form action="https://formspree.io/f/abc"><input name="email"></form>',
    'src/pages/f.astro': '<form method="post"><input name="email"></form>',
    'src/pages/g.astro': '<form method={method} action={cfg.endpoint}></form>'
  }));
  const byFile = (name) => scan.findings.filter((f) => f.file.endsWith(name)).map((f) => f.rule);
  assert.deepEqual(byFile('a.astro'), ['form-no-method']);
  assert.deepEqual(byFile('b.astro'), ['form-get-method']);
  assert.deepEqual(byFile('c.astro'), []);
  assert.deepEqual(byFile('d.astro'), []);
  assert.deepEqual(byFile('e.astro'), []);
  assert.deepEqual(byFile('f.astro'), ['form-no-action']);
});

test('logging an error class or code is not payload logging; generated .d.ts files are not surfaces', () => {
  const scan = scanProject(project({
    'src/pages/api/s.ts': GOOD_HANDLER.replace("error instanceof Error ? error.name : 'unknown'", "error?.code, error?.message"),
    'src/pages/api/escape.ts': 'export const escapeHtml = (s) => s;',
    'worker-configuration.d.ts': `${'declare const x: string;\n'.repeat(30000)}`
  }));
  assert.deepEqual(rules(scan, 'fail'), [], JSON.stringify(scan.findings));
});

test('a project without any form is INFO, not a failure', () => {
  const scan = scanProject(project({ 'src/pages/index.astro': '<h1>Hello</h1>' }));
  assert.deepEqual(rules(scan), ['no-form']);
  assert.equal(scan.findings[0].severity, 'info');
});

test('fails closed on malformed surfaces', () => {
  const unclosed = scanProject(project({ 'src/pages/a.astro': '<form method="post" action="/x" class="a' + 'b'.repeat(7000) }));
  assert.ok(rules(unclosed, 'fail').includes('malformed-surface'));
  const braces = scanProject(project({
    'src/pages/api/s.ts': "export const POST = async ({request}) => { const d = await request.formData(); try { await env.SEND_EMAIL.send({to:'a'}); } catch (e) { console.log('x'); \n"
  }));
  assert.ok(rules(braces, 'fail').includes('malformed-surface'));
  const huge = scanProject(project({ 'src/pages/a.astro': `<form method="post" action="/x"></form>${' '.repeat(600 * 1024)}` }));
  assert.ok(rules(huge, 'fail').includes('malformed-surface'));
});

test('promise-style .catch on the send is a swallowed error unless it rethrows', () => {
  const swallow = scanProject(project({
    'src/pages/api/s.ts': "export const POST = async ({request}) => { const d = await request.formData(); await env.SEND_EMAIL.send({to:'a'}).catch(() => { console.warn('no'); }); return new Response('ok'); /* 503 */ };"
  }));
  assert.ok(rules(swallow, 'fail').includes('swallowed-send-error'));
  const honest = scanProject(project({
    'src/pages/api/s.ts': "export const POST = async ({request}) => { const d = await request.formData(); await env.SEND_EMAIL.send({to:'a'}).catch(() => { throw new Error('x'); }); return new Response('ok', {status: 200}); };\nconst z = 502;"
  }));
  assert.ok(!rules(honest, 'fail').includes('swallowed-send-error'));
});

test('analysis helpers: comments are blanked, regex literals with quotes do not break brace matching', () => {
  const src = "const a = /[\"'`]/; // comment { \nfunction f() { return 'x}'; }\n/* } */";
  const stripped = stripComments(src);
  assert.equal(stripped.length, src.length);
  assert.ok(!stripped.includes('comment'));
  const open = stripped.indexOf('{', stripped.indexOf('function'));
  assert.equal(stripped[matchBrace(stripped, open)], '}');
  assert.equal(matchBrace('{ { }', 0), -1);
});

test('CLI: help is structured, scan exit codes follow the findings, JSON output parses', () => {
  const help = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8', env: { ...process.env, PORTABLE_TOOLKIT_HELP_JSON: '1', PORTABLE_TOOLKIT_AUTO_UPDATE: '0' } });
  const parsed = JSON.parse(help.stdout.trim().split('\n').pop());
  assert.equal(parsed.name, 'form-doctor');
  assert.ok(parsed.exitCodes.length >= 3 && parsed.examples.length >= 2);

  const bad = project({ 'src/pages/contact.astro': '<form><input name="email"></form>' });
  const failing = spawnSync(process.execPath, [CLI, 'scan', '--project-root', bad, '--json'], { encoding: 'utf8', env: { ...process.env, PORTABLE_TOOLKIT_AUTO_UPDATE: '0' } });
  assert.equal(failing.status, 2);
  assert.equal(JSON.parse(failing.stdout).findings[0].rule, 'form-no-method');

  const none = project({ 'src/pages/index.astro': '<h1>x</h1>' });
  const passing = spawnSync(process.execPath, [CLI, 'scan', '--project-root', none], { encoding: 'utf8', env: { ...process.env, PORTABLE_TOOLKIT_AUTO_UPDATE: '0' } });
  assert.equal(passing.status, 0);
  assert.match(passing.stdout, /no-form/);
});

test('a <form> quoted in an Astro frontmatter doc comment is not a form', () => {
  const { scanMarkup } = scanModule;
  const documented = `---\n/**\n * Outputs: a real <form method="post"> that posts natively.\n */\nconst x = 1;\n---\n<form method="post" action="/api/contact"></form>\n`;
  const result = scanMarkup(documented, 'ContactForm.astro');
  assert.equal(result.forms.length, 1, 'only the real markup form counts');
  assert.deepEqual(result.findings.map((f) => f.rule), []);
  const bare = scanMarkup(`---\n/** a <form method="post"> */\n---\n<p>none</p>\n`, 'x.astro');
  assert.equal(bare.forms.length, 0);
});
