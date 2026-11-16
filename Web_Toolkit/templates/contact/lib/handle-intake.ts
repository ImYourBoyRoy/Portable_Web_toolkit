// ./Web_Toolkit/templates/contact/lib/handle-intake.ts
/**
 * A multi-field intake/contact endpoint as a plain function: (Request, URL, deps) -> Response. The Astro route is a
 * thin wrapper that maps the Worker `env` onto `deps`; tests call this directly with a mocked mail binding.
 * Copy to: src/lib/contact/handle-intake.ts (with contact-lib.ts and intake-lib.ts next to it).
 *
 * Pipeline: origin -> content type -> per-IP rate limit -> capped body read -> allowlist parse (honeypot, time trap,
 * validation) -> duplicate id -> optional Turnstile -> mail binding present -> send -> record id -> respond.
 *
 * Status contract (the form relies on it; form-doctor probes it):
 *   200 only after the mail provider accepted the message (or a neutral bot response for the honeypot, nothing sent)
 *   400 unreadable or unexpected input, 403 cross-site, 413 too large, 415 wrong content type,
 *   422 invalid fields or a too-fast submission, 429 rate limited (Retry-After),
 *   502 provider rejected the send, 503 not configured (no binding, Turnstile misconfigured) or spam check down.
 * Success means "accepted by the mail provider", never "delivered to an inbox".
 * Logging: a short submission id, the service key and an error code. Never the payload, name or email.
 */
import {
  clientIp,
  createMemoryLimiter,
  decideRateLimit,
  isAllowedOrigin,
  isLocalHostname,
  isTurnstileTestSecret,
  verifyTurnstile,
  type MemoryLimiter,
  type RateLimiterBinding
} from './contact-lib.ts';
import {
  BodyTooLargeError,
  buildIntakeHtml,
  buildIntakeResultPage,
  buildIntakeSubject,
  buildIntakeText,
  createRecentIds,
  isFormContentType,
  parseFormBody,
  parseIntake,
  readBodyLimited,
  type IntakeSchema,
  type RecentIds
} from './intake-lib.ts';

export interface IntakeConfig {
  siteName: string;
  /** Subject prefix, for example "Strategy Intake". The submission id follows it. */
  subjectPrefix: string;
  recipient: string;
  sender: string;
  senderName: string;
  /** Shown to visitors on every failure path. Public address only. */
  fallbackEmail: string;
  /** Where the no-JS result page sends people back to. */
  formPath: string;
  /** Hard cap for the whole request body in bytes. */
  maxBodyBytes: number;
  /** Faster than this after page load is treated as a bot. A missing value (no JavaScript) passes. 0 disables. */
  minFillMs: number;
  rateLimit: { bindingPeriodSeconds: number; memory: { limit: number; windowMs: number } | null };
  /** Accepted ids are remembered this long so a retry of an already-sent inquiry does not mail twice. */
  duplicateTtlMs: number;
  /** OFF by default in the examples: honeypot, time trap, rate limit and body cap come first. */
  turnstile: { enabled: boolean; action: string };
  /** Schema field names used for Reply-To, the subject and the log. */
  nameField: string;
  emailField: string;
  topicField: string;
  /** Optional human labels for topic values, used in the subject only. */
  topicLabels?: Readonly<Record<string, string>>;
}

export interface SendEmailLike {
  send(message: {
    to: string;
    from: { email: string; name: string };
    replyTo: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

export interface IntakeBindings {
  mail?: SendEmailLike;
  rateLimit?: RateLimiterBinding;
  turnstileSecret?: string;
}

export interface IntakeDeps {
  bindings: IntakeBindings;
  config: IntakeConfig;
  schema: IntakeSchema;
  now?: () => Date;
  /** Module-level state shared across requests in one isolate when omitted. Inject fresh ones in tests. */
  recentIds?: RecentIds;
  memoryLimiter?: MemoryLimiter | null;
  fetchImpl?: Parameters<typeof verifyTurnstile>[0]['fetchImpl'];
  log?: (level: 'info' | 'error', entry: Record<string, string | number | undefined>) => void;
}

interface Outcome {
  ok: boolean;
  status: number;
  code: string;
  message: string;
  id?: string;
  duplicate?: boolean;
  retryAfter?: number;
  fieldErrors?: Record<string, string>;
}

// One in-isolate state per config object, so two forms in one Worker do not share limits or duplicate memory.
const defaults = new WeakMap<IntakeConfig, { recent: RecentIds; memory: MemoryLimiter | null }>();
function defaultsFor(config: IntakeConfig) {
  let state = defaults.get(config);
  if (!state) {
    state = { recent: createRecentIds({ ttlMs: config.duplicateTtlMs }), memory: config.rateLimit.memory ? createMemoryLimiter(config.rateLimit.memory) : null };
    defaults.set(config, state);
  }
  return state;
}

const BASE_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;

const SUCCESS_MESSAGE = 'Your inquiry was handed to the mail system. I will reply by email.';

const MESSAGES = {
  forbidden: 'This request was not accepted.',
  unsupported: 'The form could not be read. Please reload the page and try again.',
  tooLarge: 'That inquiry is too large to send. Please shorten the longest answers and try again.',
  rateLimited: 'Too many attempts from this connection. Please wait a moment and try again.',
  unreadable: 'The form could not be read. Please try again.',
  rejected: 'Something in the form was not expected. Please reload the page and try again.',
  invalid: 'Please check the highlighted fields and try again.',
  tooFast: 'That was sent very quickly. Please check your answers and send again.',
  spam: 'The spam check did not pass. Please reload the page and try again.',
  spamDown: 'The spam check is temporarily unavailable. Please try again shortly.',
  notConfigured: 'The inquiry form is not available right now. Your answers were not sent.',
  deliveryFailed: 'Your inquiry could not be sent right now. Your answers were not sent.',
  generic: 'Something went wrong. Your answers were not sent.'
} as const;

function fail(status: number, code: string, message: string, extra: Partial<Outcome> = {}): Outcome {
  return { ok: false, status, code, message, ...extra };
}

/** Provider error codes look like E_SENDER_NOT_VERIFIED. Only a safe, short token is logged, never a message. */
function errorToken(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(code)) return code;
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(name)) return name;
  }
  return 'unknown';
}

function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').toLowerCase().includes('application/json');
}

function respond(outcome: Outcome, request: Request, config: IntakeConfig, topic: string): Response {
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (outcome.retryAfter) headers['Retry-After'] = String(outcome.retryAfter);

  if (wantsJson(request)) {
    const body = outcome.ok
      ? { ok: true, id: outcome.id, ...(outcome.duplicate ? { duplicate: true } : {}), message: outcome.message }
      : {
          ok: false,
          code: outcome.code,
          error: outcome.message,
          ...(outcome.id ? { id: outcome.id } : {}),
          ...(outcome.retryAfter ? { retryAfter: outcome.retryAfter } : {}),
          ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {})
        };
    return new Response(JSON.stringify(body), { status: outcome.status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
  }

  const detail = outcome.fieldErrors
    ? `${outcome.message} ${Object.keys(outcome.fieldErrors).join(', ')}.`
    : outcome.message;
  const page = buildIntakeResultPage({
    ok: outcome.ok,
    title: outcome.ok ? 'Inquiry received' : 'Inquiry not sent',
    message: detail,
    reference: outcome.id,
    backHref: outcome.ok ? '/' : config.formPath,
    siteName: config.siteName,
    fallbackEmail: config.fallbackEmail,
    mailtoSubject: `Inquiry${topic ? ` (${topic})` : ''}${outcome.id ? ` ${outcome.id}` : ''}`
  });
  return new Response(page, { status: outcome.status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function handleIntake(request: Request, url: URL, deps: IntakeDeps): Promise<Response> {
  const { config, schema, bindings } = deps;
  const log = deps.log ?? ((level, entry) => (level === 'error' ? console.error : console.info)('intake', JSON.stringify(entry)));
  const state = defaultsFor(config);
  const recent = deps.recentIds ?? state.recent;
  const memory = deps.memoryLimiter === undefined ? state.memory : deps.memoryLimiter;
  let topic = '';
  let id: string | undefined;

  const done = (outcome: Outcome): Response => {
    if (!outcome.ok) log('error', { id: outcome.id ?? id, service: topic || undefined, code: outcome.code, status: outcome.status });
    return respond(outcome, request, config, topic);
  };

  try {
    if (!isAllowedOrigin({ origin: request.headers.get('origin'), secFetchSite: request.headers.get('sec-fetch-site') }, url.origin)) {
      return done(fail(403, 'forbidden', MESSAGES.forbidden));
    }
    const contentType = request.headers.get('content-type');
    if (!isFormContentType(contentType)) return done(fail(415, 'unsupported_media_type', MESSAGES.unsupported));

    const rate = await decideRateLimit({
      ip: clientIp(request.headers),
      binding: bindings.rateLimit,
      fallback: memory,
      group: 'intake',
      bindingPeriodSeconds: config.rateLimit.bindingPeriodSeconds
    });
    if (!rate.allowed) return done(fail(429, 'rate_limited', MESSAGES.rateLimited, { retryAfter: rate.retryAfter }));

    let entries: Array<[string, unknown]>;
    try {
      entries = await parseFormBody(await readBodyLimited(request, config.maxBodyBytes), contentType ?? '');
    } catch (error) {
      if (error instanceof BodyTooLargeError) return done(fail(413, 'payload_too_large', MESSAGES.tooLarge));
      return done(fail(400, 'unreadable_body', MESSAGES.unreadable));
    }

    const parsed = parseIntake(entries, schema, config.minFillMs);
    if (parsed.kind === 'honeypot') {
      // Bots get a neutral success so they stop probing. Nothing is sent and nothing but the id is logged.
      log('info', { id: parsed.submissionId, code: 'honeypot' });
      return respond({ ok: true, status: 200, code: 'ok', message: SUCCESS_MESSAGE, id: parsed.submissionId }, request, config, '');
    }
    if (parsed.kind === 'rejected') {
      if (parsed.code === 'invalid_fields') return done(fail(422, parsed.code, MESSAGES.invalid, { fieldErrors: parsed.fieldErrors }));
      if (parsed.code === 'too_fast') return done(fail(422, parsed.code, MESSAGES.tooFast));
      if (parsed.code === 'file_upload' || parsed.code === 'unexpected_field' || parsed.code === 'too_many_fields' || parsed.code === 'duplicate_field') {
        return done(fail(400, parsed.code, MESSAGES.rejected));
      }
      return done(fail(parsed.status, parsed.code, MESSAGES.rejected));
    }

    const { values, meta } = parsed;
    id = meta.submissionId;
    const service = typeof values[config.topicField] === 'string' ? String(values[config.topicField]) : '';
    topic = service;

    // A retry of an inquiry the provider already accepted is answered as success without mailing again.
    if (meta.clientId && recent.has(id)) {
      log('info', { id, service, code: 'duplicate' });
      return respond({ ok: true, status: 200, code: 'ok', message: SUCCESS_MESSAGE, id, duplicate: true }, request, config, service);
    }

    if (config.turnstile.enabled) {
      const secret = (bindings.turnstileSecret ?? '').trim();
      if (secret && isTurnstileTestSecret(secret) && !isLocalHostname(url.hostname)) {
        return done(fail(503, 'turnstile_test_secret', MESSAGES.notConfigured, { id }));
      }
      const verdict = await verifyTurnstile({
        secret,
        token: meta.turnstileToken,
        remoteIp: request.headers.get('cf-connecting-ip'),
        expectedAction: config.turnstile.action,
        expectedHostname: url.hostname,
        fetchImpl: deps.fetchImpl
      });
      if (!verdict.ok) {
        if (verdict.reason === 'not-configured') return done(fail(503, 'turnstile_not_configured', MESSAGES.notConfigured, { id }));
        if (verdict.reason === 'unavailable') return done(fail(503, 'turnstile_unavailable', MESSAGES.spamDown, { id }));
        return done(fail(400, `turnstile_${verdict.reason}`, MESSAGES.spam, { id }));
      }
    }

    const mailer = bindings.mail;
    if (!mailer || typeof mailer.send !== 'function') return done(fail(503, 'mail_not_configured', MESSAGES.notConfigured, { id }));

    const receivedAt = (deps.now?.() ?? new Date()).toISOString();
    const name = String(values[config.nameField] ?? '');
    const email = String(values[config.emailField] ?? '');
    const mail = { siteName: config.siteName, submissionId: id, receivedAt };
    try {
      await mailer.send({
        to: config.recipient,
        from: { email: config.sender, name: config.senderName },
        replyTo: email,
        subject: buildIntakeSubject(config.subjectPrefix, id, name, config.topicLabels?.[service] ?? (service || 'inquiry')),
        text: buildIntakeText(schema, values, mail),
        html: buildIntakeHtml(schema, values, mail)
      });
    } catch (error) {
      log('error', { id, service, code: 'mail_send_failed', provider: errorToken(error), status: 502 });
      return respond(fail(502, 'mail_send_failed', MESSAGES.deliveryFailed, { id }), request, config, service);
    }

    recent.add(id);
    log('info', { id, service, code: 'sent' });
    return respond({ ok: true, status: 200, code: 'ok', message: SUCCESS_MESSAGE, id }, request, config, service);
  } catch (error) {
    log('error', { id, service: topic || undefined, code: 'unhandled', provider: errorToken(error), status: 500 });
    return respond(fail(500, 'internal_error', MESSAGES.generic, { id }), request, config, topic);
  }
}

export function methodNotAllowed(): Response {
  return new Response(JSON.stringify({ ok: false, code: 'method_not_allowed', error: 'Use POST to submit the inquiry form.' }), {
    status: 405,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', Allow: 'POST' }
  });
}
