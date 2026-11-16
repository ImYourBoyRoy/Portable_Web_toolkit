// ./Web_Toolkit/templates/contact/pages/api/contact.ts
/**
 * Worker-only contact endpoint (Astro API route, rendered on demand).
 * Copy to: src/pages/api/contact.ts  (lib files go to src/lib/contact/, see README.md).
 *
 * Pipeline: method + origin -> per-IP rate limit -> capped body read (stream counted, 413) -> parse and validate ->
 * honeypot (neutral success, no mail) -> time trap (422) -> duplicate submission id -> Turnstile siteverify (only when
 * `turnstile.mode` is not "off"; secret from Worker secrets) -> send via the Cloudflare Email Service `EMAIL` binding.
 * Success is answered only after the send call resolved: a missing binding is 503, a provider rejection 502.
 * All decisions live in lib/contact-lib.ts and lib/intake-lib.ts and are unit tested.
 *
 * Responses: JSON `{ ok, error?, fieldErrors? }` for fetch clients (Accept or Content-Type: application/json),
 * a 303 redirect for plain form posts that carry a same-site `returnTo`, otherwise a minimal HTML result page.
 * Required Worker configuration: EMAIL binding, TURNSTILE_SECRET_KEY, CONTACT_RECIPIENT_EMAIL, CONTACT_FROM_EMAIL.
 * Optional: CONTACT_FROM_NAME, CONTACT_RATE_LIMIT binding. Nothing private is read at build time.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  HONEYPOT_FIELD,
  TURNSTILE_ACTION,
  buildHtml,
  buildResultPage,
  buildSubject,
  buildText,
  checkFillTime,
  clientIp,
  createMemoryLimiter,
  decideRateLimit,
  isAllowedOrigin,
  isLocalHostname,
  isTurnstileTestSecret,
  parseContactInput,
  safeReturnPath,
  unexpectedFields,
  verifyTurnstile,
  wantsJson,
  type FieldErrors,
  type MemoryLimiter,
  type RateLimiterBinding
} from '../../lib/contact/contact-lib';
import { BodyTooLargeError, createRecentIds, newSubmissionId, parseFormBody, readBodyLimited } from '../../lib/contact/intake-lib';
import { getContactConfig } from '../../lib/contact/load-config';

export const prerender = false;

interface SendEmailBinding {
  send(message: {
    to: string;
    from: { email: string; name: string };
    replyTo?: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

interface ContactEnv {
  EMAIL?: SendEmailBinding;
  CONTACT_RATE_LIMIT?: RateLimiterBinding;
  TURNSTILE_SECRET_KEY?: string;
  CONTACT_RECIPIENT_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  CONTACT_FROM_NAME?: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const config = getContactConfig();
const memoryLimiter: MemoryLimiter | null = config.memoryLimit ? createMemoryLimiter(config.memoryLimit) : null;
// Ids the provider already accepted: a retry of a sent message is answered as success without mailing twice.
const recentIds = createRecentIds({ ttlMs: 60 * 60_000 });

const secret = (name: keyof ContactEnv): string => {
  const value = (env as unknown as ContactEnv)[name];
  return typeof value === 'string' ? value.trim() : '';
};

interface Outcome {
  ok: boolean;
  status: number;
  message: string;
  id?: string;
  fieldErrors?: FieldErrors;
  headers?: Record<string, string>;
}

const SUCCESS: Outcome = { ok: true, status: 200, message: 'Thank you. Your message is on its way.' };

const fail = (status: number, message: string, extra: Partial<Outcome> = {}): Outcome => ({ ok: false, status, message, ...extra });

const BASE_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function respond(outcome: Outcome, mode: { json: boolean; returnTo: string | null; siteName: string }): Response {
  const headers: Record<string, string> = { ...BASE_HEADERS, ...outcome.headers };
  if (mode.json) {
    const body = outcome.ok
      ? { ok: true, ...(outcome.id ? { id: outcome.id } : {}) }
      : { ok: false, error: outcome.message, ...(outcome.id ? { id: outcome.id } : {}), ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}) };
    return new Response(JSON.stringify(body), { status: outcome.status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
  }
  if (mode.returnTo) {
    const target = new URL(mode.returnTo, 'https://placeholder.invalid');
    target.searchParams.set('contact', outcome.ok ? 'sent' : 'error');
    return new Response(null, { status: 303, headers: { ...headers, Location: `${target.pathname}${target.search}#contact-status` } });
  }
  // Without JavaScript there is no inline field marking, so the page lists what needs fixing.
  const message = outcome.fieldErrors ? Object.values(outcome.fieldErrors).join(' ') : outcome.message;
  const page = buildResultPage({ ok: outcome.ok, message, backHref: config.defaultReturnPath, siteName: mode.siteName });
  return new Response(page, { status: outcome.status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  const isJson = type.includes('application/json');
  const isForm = type.includes('multipart/form-data') || type.includes('application/x-www-form-urlencoded');
  if (!isJson && !isForm) throw new TypeError('unsupported content type');
  // The stream is counted as it arrives: Content-Length can be absent or wrong.
  const bytes = await readBodyLimited(request, MAX_BODY_BYTES);
  if (isJson) {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of await parseFormBody(bytes, type)) {
    if (typeof value === 'string' && !(key in out)) out[key] = value;
  }
  return out;
}

async function handle(request: Request, url: URL): Promise<Outcome & { returnTo: string | null }> {
  const noReturn = (outcome: Outcome) => ({ ...outcome, returnTo: null });

  if (!isAllowedOrigin({ origin: request.headers.get('origin'), secFetchSite: request.headers.get('sec-fetch-site') }, url.origin)) {
    return noReturn(fail(403, 'This request was not accepted.'));
  }
  const rate = await decideRateLimit({ ip: clientIp(request.headers), binding: (env as unknown as ContactEnv).CONTACT_RATE_LIMIT, fallback: memoryLimiter });
  if (!rate.allowed) {
    return noReturn(fail(429, 'Too many messages. Please wait a few minutes and try again.', { headers: { 'Retry-After': String(rate.retryAfter) } }));
  }

  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return noReturn(fail(413, 'That message is too large.'));
    return noReturn(fail(400, 'The form could not be read. Please try again.'));
  }

  // Strict allowlist: a field this form does not send (or contact.json `extraFields` does not declare) is a probe or a bug.
  if (unexpectedFields(body, config.extraFields).length > 0) {
    return noReturn(fail(422, 'The form sent fields this endpoint does not accept.'));
  }

  const parsed = parseContactInput(body, {
    inquiryTypes: config.inquiryTypes,
    minMessageLength: config.minMessageLength,
    maxLinks: config.maxLinks,
    honeypotField: HONEYPOT_FIELD
  });
  // Bots get the same neutral success as people, and nothing is sent.
  const requestedReturn = safeReturnPath(body.returnTo);
  if (parsed.kind === 'honeypot') return { ...SUCCESS, returnTo: requestedReturn };
  if (parsed.kind === 'invalid') {
    return { ...fail(422, 'Please check the highlighted fields and try again.', { fieldErrors: parsed.errors }), returnTo: requestedReturn };
  }
  const returnTo = parsed.returnTo;

  // A submission completed faster than a person can type is a bot. A missing value (no JavaScript) passes.
  if (!checkFillTime(parsed.elapsedRaw, config.minFillMs).ok) {
    return { ...fail(422, 'That was sent very quickly. Please check your message and send again.'), returnTo };
  }
  const id = parsed.submissionId ?? newSubmissionId();
  if (parsed.submissionId && recentIds.has(id)) return { ...SUCCESS, id, returnTo };

  const turnstileSecret = secret('TURNSTILE_SECRET_KEY');
  if (turnstileSecret && isTurnstileTestSecret(turnstileSecret) && !isLocalHostname(url.hostname)) {
    console.error('contact: Turnstile TEST secret configured on a non-local host; refusing to accept submissions.');
    return { ...fail(503, 'The contact form is not available right now.'), returnTo };
  }
  if (config.turnstileMode !== 'off' && (turnstileSecret || config.turnstileMode === 'required')) {
    const verdict = await verifyTurnstile({
      secret: turnstileSecret,
      token: parsed.turnstileToken,
      remoteIp: request.headers.get('cf-connecting-ip'),
      expectedAction: TURNSTILE_ACTION,
      expectedHostname: url.hostname
    });
    if (!verdict.ok) {
      switch (verdict.reason) {
        case 'not-configured':
          console.error('contact: TURNSTILE_SECRET_KEY is not set and turnstile.mode is "required".');
          return { ...fail(503, 'The contact form is not available right now.'), returnTo };
        case 'unavailable':
          return { ...fail(503, 'The spam check is temporarily unavailable. Please try again shortly.'), returnTo };
        case 'missing-token':
          return { ...fail(400, 'Please complete the spam check. It needs JavaScript; if it is turned off, email us instead.'), returnTo };
        default:
          return { ...fail(400, 'The spam check did not pass. Please reload the page and try again.'), returnTo };
      }
    }
  }

  const bindings = env as unknown as ContactEnv;
  const recipient = secret('CONTACT_RECIPIENT_EMAIL');
  const sender = secret('CONTACT_FROM_EMAIL');
  if (!bindings.EMAIL || !recipient || !sender) {
    console.error('contact: EMAIL binding, CONTACT_RECIPIENT_EMAIL or CONTACT_FROM_EMAIL is missing.', id);
    return { ...fail(503, 'The contact form is not configured yet.', { id }), returnTo };
  }

  const { submission } = parsed;
  const receivedAt = new Date().toISOString();
  try {
    await bindings.EMAIL.send({
      to: recipient,
      from: { email: sender, name: secret('CONTACT_FROM_NAME') || config.siteName },
      replyTo: submission.email,
      subject: buildSubject(config.subjectPrefix, submission.inquiryType, submission.name, id),
      text: buildText(config.siteName, submission, receivedAt, id),
      html: buildHtml(config.siteName, submission, receivedAt, id)
    });
  } catch (error) {
    // Log the failure class only: the message and addresses are personal data.
    console.error('contact: email delivery failed', id, error instanceof Error ? error.name : 'unknown');
    return { ...fail(502, 'The message could not be delivered. Please try again later.', { id }), returnTo };
  }
  recentIds.add(id);
  return { ...SUCCESS, id, returnTo };
}

export const POST: APIRoute = async ({ request, url }) => {
  const json = wantsJson(request.headers.get('accept'), request.headers.get('content-type'));
  let outcome: Outcome & { returnTo: string | null };
  try {
    outcome = await handle(request, url);
  } catch {
    outcome = { ...fail(500, 'Something went wrong. Please try again.'), returnTo: null };
  }
  return respond(outcome, { json, returnTo: outcome.returnTo, siteName: config.siteName });
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ ok: false, error: 'Method not allowed.' }), {
    status: 405,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', Allow: 'POST' }
  });
