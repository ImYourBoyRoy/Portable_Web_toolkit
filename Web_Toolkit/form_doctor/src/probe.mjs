// ./Web_Toolkit/form_doctor/src/probe.mjs
/**
 * Runtime probe against a LOCAL Worker (loopback only; production is refused). Sends only synthetic data to a
 * Worker whose mail binding is deliberately broken, so nothing is ever delivered.
 *
 * Probes (id: expectation):
 *   get-no-data: GET on the endpoint (with a query string) is not 2xx and echoes nothing
 *   oversize: a 1.5 MB POST gets 413
 *   unexpected-field: a valid payload plus an unknown field gets 400 or 422
 *   cross-site: a POST with a foreign Origin gets 403
 *   mail-missing: valid payload, mail binding removed -> 503 (not 2xx)
 *   mail-rejected: valid payload, provider rejects the destination -> 502 or 503 (not 2xx)
 *   no-leak: no probe answer contains stack traces, binding names or the probe address
 *   form-method: the served form page declares method="post"
 * `mail-missing` / `mail-rejected` need a spawned Worker with a broken binding (`--spawn`) or a server you started
 * yourself and vouch for (`--expect-mail-failure`); otherwise they are skipped as INFO and never guessed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { scanMarkup } from './scan.mjs';
import { findFreePort, startOwned, waitForUrl } from '../../shared/lib/dev-server.mjs';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const PROBE_EMAIL = 'form-doctor@example.invalid';
const LEAK = /\bat\s+\S+\s+\(|\bTypeError\b|\bReferenceError\b|\bSEND_EMAIL\b|\bnode_modules\b|form-doctor@example\.invalid|E_[A-Z_]{4,}/;
const HONEYPOT_NAME = /website_confirm|company_url|honeypot|_gotcha|^hp[_-]|hp_field|confirm_website/i;

export function assertLoopback(baseUrl) {
  const url = new URL(baseUrl);
  if (!LOOPBACK.has(url.hostname.toLowerCase())) {
    throw new Error(`Refusing to probe ${url.hostname}: the runtime probe only talks to loopback addresses (localhost, 127.0.0.1, [::1]).`);
  }
  return url;
}

function result(id, status, detail, expected) {
  return { id, status, detail, ...(expected ? { expected } : {}) };
}

/** Builds a plausible, valid payload from the served form HTML so any site's form can be probed generically. */
export function buildPayloadFromHtml(html) {
  const fields = [];
  const form = html.match(/<form\b[\s\S]*?<\/form>/i)?.[0] ?? html;
  const used = new Set();
  const add = (name, value) => {
    if (!used.has(name)) {
      used.add(name);
      fields.push([name, value]);
    }
  };
  for (const match of form.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const name = attrs.match(/\bname\s*=\s*"([^"]+)"/)?.[1] ?? attrs.match(/\bname\s*=\s*'([^']+)'/)?.[1];
    if (!name) continue;
    const type = (attrs.match(/\btype\s*=\s*"([^"]+)"/)?.[1] ?? 'text').toLowerCase();
    if (HONEYPOT_NAME.test(name) || /tabindex\s*=\s*"-1"/.test(attrs) || /\bhp-field\b|honeypot|\btrap\b/i.test(attrs)) continue;
    if (type === 'submit' || type === 'button' || type === 'checkbox' || type === 'radio' || type === 'file' || type === 'reset') continue;
    if (type === 'hidden') {
      const value = attrs.match(/\bvalue\s*=\s*"([^"]*)"/)?.[1] ?? '';
      if (/elapsed|time|ts$/i.test(name)) continue;
      add(name, value);
      continue;
    }
    if (tag === 'select') {
      const block = form.slice(match.index).match(/<select\b[\s\S]*?<\/select>/i)?.[0] ?? '';
      const option = [...block.matchAll(/<option\b([^>]*)>/gi)].find((o) => !/\bdisabled\b/.test(o[1]) && (o[1].match(/\bvalue\s*=\s*"([^"]*)"/)?.[1] ?? 'x') !== '');
      add(name, option?.[1].match(/\bvalue\s*=\s*"([^"]*)"/)?.[1] ?? '');
      continue;
    }
    if (tag === 'textarea') add(name, 'Automated form-doctor probe. Please ignore this message.');
    else if (type === 'email') add(name, PROBE_EMAIL);
    else if (type === 'tel') add(name, '555-0100');
    else if (type === 'url') add(name, 'https://example.invalid');
    else if (type === 'number') add(name, '1');
    else if (type === 'date') add(name, '2030-01-01');
    else add(name, 'FormDoctor Probe');
  }
  if (fields.length === 0) return null;
  return fields;
}

function encode(fields) {
  return new URLSearchParams(fields).toString();
}

async function send(baseUrl, endpoint, init, ip) {
  const headers = { 'cf-connecting-ip': ip, ...(init.headers ?? {}) };
  try {
    const response = await fetch(new URL(endpoint, baseUrl), { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    return { status: response.status, text, headers: response.headers };
  } catch (error) {
    return { status: 0, text: '', error: error instanceof Error ? error.message : String(error), headers: new Headers() };
  }
}

/**
 * Runs the probes. `options.mail` describes the Worker's mail binding: 'missing' | 'rejected' | 'unknown'.
 * Returns { results, skipped }. Never throws for a failing probe; throws only for refused targets.
 */
export async function runProbes({ baseUrl, endpoint: endpointHint, formPage, mail = 'unknown', expectMailFailure = false }) {
  assertLoopback(baseUrl);
  const results = [];
  let ipCounter = 10;
  const ip = () => `198.51.100.${ipCounter++}`;
  const leaks = [];

  const page = await send(baseUrl, formPage, { method: 'GET' }, ip());
  if (page.status !== 200) {
    results.push(result('form-page', 'fail', `GET ${formPage} answered ${page.status}; the form page could not be loaded.`));
    return { results };
  }
  const forms = scanMarkup(page.text, formPage);
  const posting = forms.forms.find((f) => f.method === 'post');
  const unsafe = forms.findings.filter((f) => f.rule === 'form-no-method' || f.rule === 'form-get-method');
  results.push(
    unsafe.length > 0
      ? result('form-method', 'fail', 'The served page has a form without method="post"; a no-JS submit would send GET with the answers in the URL.', 'method="post"')
      : posting
        ? result('form-method', 'pass', `Served form posts with method="post" to ${posting.action ?? '(same page)'}.`)
        : result('form-method', 'info', 'No contact form markup was served on that page.')
  );

  // The served form's own action is the truth (source actions can be expressions); a hint only fills a gap.
  const endpoint = posting?.action && posting.action.startsWith('/') ? posting.action : endpointHint;
  if (!endpoint) {
    results.push(result('endpoint', 'fail', 'The served form has no usable action and no --endpoint was given, so the handler cannot be probed.'));
    return { results };
  }
  const fields = buildPayloadFromHtml(page.text);
  if (!fields) {
    results.push(result('payload', 'fail', 'No named fields could be read from the served form, so valid-payload probes cannot run.'));
  }

  const get = await send(baseUrl, `${endpoint}?name=FormDoctor&email=${encodeURIComponent(PROBE_EMAIL)}`, { method: 'GET' }, ip());
  leaks.push(get.text);
  results.push(
    get.status >= 200 && get.status < 300
      ? result('get-no-data', 'fail', `GET ${endpoint} with data in the query answered ${get.status}; a GET fallback must never be accepted.`, 'non-2xx')
      : get.status === 0
        ? result('get-no-data', 'fail', `GET ${endpoint} failed: ${get.error}`)
        : result('get-no-data', 'pass', `GET answered ${get.status}.`)
  );

  const big = await send(baseUrl, endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: `message=${'a'.repeat(1_500_000)}` }, ip());
  leaks.push(big.text);
  results.push(big.status === 413 ? result('oversize', 'pass', 'A 1.5 MB body got 413.') : result('oversize', 'fail', `A 1.5 MB body got ${big.status || 'no answer'} instead of 413.`, '413'));

  if (fields) {
    const unexpected = await send(baseUrl, endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: encode([...fields, ['__form_doctor_unexpected__', '1']]) }, ip());
    leaks.push(unexpected.text);
    results.push(
      unexpected.status === 400 || unexpected.status === 422
        ? result('unexpected-field', 'pass', `An unknown field got ${unexpected.status}.`)
        : result('unexpected-field', 'fail', `An unknown field got ${unexpected.status || 'no answer'}; handlers must reject fields outside the allowlist with 400 or 422.`, '400/422')
    );

    const cross = await send(baseUrl, endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', origin: 'https://form-doctor.invalid' }, body: encode(fields) }, ip());
    leaks.push(cross.text);
    results.push(cross.status === 403 ? result('cross-site', 'pass', 'A foreign Origin got 403.') : result('cross-site', 'warn', `A foreign Origin got ${cross.status || 'no answer'} instead of 403.`, '403'));

    if (mail === 'missing' || mail === 'rejected' || expectMailFailure) {
      const valid = await send(baseUrl, endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: encode(fields) }, ip());
      leaks.push(valid.text);
      const id = mail === 'rejected' ? 'mail-rejected' : mail === 'missing' ? 'mail-missing' : 'mail-failure';
      const wanted = mail === 'rejected' ? '502/503' : mail === 'missing' ? '503' : 'non-2xx';
      const ok = mail === 'rejected' ? valid.status === 502 || valid.status === 503 : mail === 'missing' ? valid.status === 503 : valid.status >= 500 && valid.status < 600;
      if (valid.status >= 200 && valid.status < 300) {
        results.push(result(id, 'fail', `With a broken mail binding the form answered ${valid.status}: the visitor is told the inquiry was sent but nothing was delivered. This is the silent lead loss.`, wanted));
      } else if (ok) {
        results.push(result(id, 'pass', `Broken mail binding answered ${valid.status}.`));
      } else if (valid.status === 429) {
        results.push(result(id, 'info', 'The probe was rate limited; rerun after the window.'));
      } else {
        results.push(result(id, 'warn', `Broken mail binding answered ${valid.status || 'no answer'}; expected ${wanted}. A 4xx can mean the synthetic payload failed validation: add a form-doctor payload override.`, wanted));
      }
    } else {
      results.push(result('mail-failure', 'info', 'Skipped: no Worker with a broken mail binding. Use --spawn, or start one yourself and pass --expect-mail-failure.'));
    }
  }

  const leaky = leaks.filter((text) => LEAK.test(text));
  results.push(leaky.length > 0 ? result('no-leak', 'fail', 'A probe answer contained internal detail (stack trace, binding name, provider code or the probe address).') : result('no-leak', 'pass', 'No probe answer exposed internals.'));
  return { results };
}

/* --------------------------------------------------------------- spawning */


/**
 * Starts `wrangler dev` on a temporary copy of the built config with the mail binding broken, runs `fn(baseUrl)` and
 * always stops the server and removes the copy. mode: 'missing' removes every send_email binding; 'rejected' keeps
 * the binding but allows only an unreachable destination, which the local simulator refuses like a provider would.
 */
export async function withBrokenMailWorker({ projectRoot, wranglerConfig, mode, fn }) {
  const configPath = path.resolve(projectRoot, wranglerConfig);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const bindings = Array.isArray(config.send_email) ? config.send_email : [];
  if (bindings.length === 0 && mode === 'rejected') throw new Error('The built Worker config declares no send_email binding, so a rejected-destination probe is meaningless.');
  if (mode === 'missing') delete config.send_email;
  else config.send_email = bindings.map((b) => ({ ...b, destination_address: 'blocked@form-doctor.invalid', remote: false }));
  const temp = path.join(path.dirname(configPath), `.form-doctor.${mode}.wrangler.json`);
  fs.writeFileSync(temp, JSON.stringify(config));
  // A free port chosen by the OS, and a server the toolkit owns: registered, stopped by pid group, never someone else's.
  const { port } = await findFreePort({ host: '127.0.0.1' });
  // Run wrangler's own JS entry with this Node: the `.bin/wrangler` shim is a shell script on Windows and cannot be spawned.
  const wranglerEntry = path.resolve(projectRoot, 'node_modules/wrangler/bin/wrangler.js');
  const useEntry = fs.existsSync(wranglerEntry);
  const wranglerArgs = ['dev', '--config', temp, '--port', String(port), '--ip', '127.0.0.1'];
  const server = startOwned({ command: useEntry ? process.execPath : 'npx', args: useEntry ? [wranglerEntry, ...wranglerArgs] : ['wrangler', ...wranglerArgs], cwd: projectRoot, label: 'form-doctor worker', port, startedBy: 'form-doctor', env: { CI: '1', WRANGLER_SEND_METRICS: 'false' } });
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    if (!(await waitForUrl(`${baseUrl}/`, 90_000, server.child, { port }))) throw new Error('The spawned Worker did not answer within 90 seconds (or exited first).');
    return await fn(baseUrl);
  } finally {
    await server.stop();
    fs.rmSync(temp, { force: true });
  }
}
