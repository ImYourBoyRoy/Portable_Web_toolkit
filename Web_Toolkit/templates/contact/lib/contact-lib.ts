// ./Web_Toolkit/templates/contact/lib/contact-lib.ts
/**
 * Pure logic for the Worker-backed contact form: input cleaning and validation, header-injection defence,
 * honeypot, Turnstile siteverify (injectable fetch), rate-limit decisions, origin and redirect guards,
 * message rendering. No Cloudflare, Astro or DOM imports, and ERASABLE-SYNTAX TypeScript only (no enums,
 * namespaces or parameter properties) so Node can import it directly in tests.
 * Copy to: src/lib/contact/contact-lib.ts
 */

export const HONEYPOT_FIELD = 'company_url';
/** Set by the form script: milliseconds from page load to submit. Absent without JavaScript (that passes the trap). */
export const ELAPSED_FIELD = 'form_elapsed';
/** Created by the form script once per attempt series so a retry is recognisable. The server makes one when absent. */
export const SUBMISSION_ID_FIELD = 'submission_id';
export const TURNSTILE_RESPONSE_FIELD = 'cf-turnstile-response';
export const TURNSTILE_ACTION = 'contact';
export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const CONTACT_LIMITS = {
  name: 120,
  email: 254,
  inquiryType: 80,
  message: 5000,
  token: 2048,
  returnTo: 200,
  subject: 150
} as const;

export type ContactField = 'name' | 'email' | 'inquiryType' | 'message';
export type FieldErrors = Partial<Record<ContactField, string>>;

export interface ContactSubmission {
  name: string;
  email: string;
  inquiryType: string;
  message: string;
}

export interface ContactRules {
  /** Allowed inquiry types. Empty means free text (single line). A blank value is always allowed. */
  inquiryTypes: readonly string[];
  minMessageLength: number;
  /** Messages with more links than this are rejected as spam. */
  maxLinks: number;
  honeypotField: string;
}

export const DEFAULT_RULES: ContactRules = {
  inquiryTypes: [],
  minMessageLength: 10,
  maxLinks: 3,
  honeypotField: HONEYPOT_FIELD
};

export const FIELD_ERRORS = {
  nameRequired: 'Enter your name.',
  nameLong: `Keep your name under ${CONTACT_LIMITS.name} characters.`,
  emailRequired: 'Enter your email address.',
  emailInvalid: 'Enter a valid email address, like name@example.com.',
  inquiryInvalid: 'Choose one of the listed inquiry types.',
  messageRequired: 'Enter a message.',
  messageShort: 'Add a little more detail to your message.',
  messageLong: `Keep your message under ${CONTACT_LIMITS.message} characters.`,
  messageLinks: 'Please remove some links from your message.'
} as const;

export type ParseResult =
  | { kind: 'honeypot' }
  | { kind: 'invalid'; errors: FieldErrors }
  | {
      kind: 'valid';
      submission: ContactSubmission;
      turnstileToken: string;
      returnTo: string | null;
      /** Client-made id when it has the expected shape, otherwise null (the route creates one). */
      submissionId: string | null;
      /** Raw elapsed value as sent, or undefined when the field is absent (no JavaScript). */
      elapsedRaw: string | undefined;
    };

const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,48}$/;

/**
 * Time-to-submit trap. A missing value means no script set it (a plain browser post) and passes; a present value
 * under `minMs` (or not a number) is a bot. `minMs` 0 disables the trap.
 */
export function checkFillTime(elapsedRaw: unknown, minMs: number): { ok: boolean; elapsedMs: number | null } {
  if (minMs <= 0 || typeof elapsedRaw !== 'string' || elapsedRaw.trim() === '') return { ok: true, elapsedMs: null };
  const raw = elapsedRaw.trim();
  const elapsedMs = /^\d{1,9}$/.test(raw) ? Number(raw) : 0;
  return { ok: elapsedMs >= minMs, elapsedMs };
}

/** Bidirectional-control characters can disguise text in a mail client; strip them everywhere. */
const BIDI = /[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g;

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let cut = text.slice(0, limit);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

/** One line of text: every control character (CR, LF, tab, NUL...) becomes a space, then whitespace collapses. */
export function cleanSingleLine(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  const text = value
    .replace(BIDI, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F\u0085\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(text, limit);
}

/** Multi-line text: normalises newlines, drops other control characters, trims runaway blank lines. */
export function cleanMultiline(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  const text = value
    .replace(BIDI, '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\u2028|\u2029|\u0085/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return truncate(text, limit);
}

const EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** Practical address check. Rejects whitespace, control characters, display-name tricks and multiple addresses. */
export function isValidEmail(value: string): boolean {
  if (value.length === 0 || value.length > CONTACT_LIMITS.email) return false;
  const at = value.lastIndexOf('@');
  if (at < 1 || at > 64) return false;
  if (value.includes('..') || value.startsWith('.') || value.slice(0, at).endsWith('.')) return false;
  return EMAIL.test(value);
}

export function countLinks(text: string): number {
  return (text.match(/https?:\/\/|www\./gi) ?? []).length;
}

const rawLength = (value: unknown): number => (typeof value === 'string' ? value.trim().length : 0);

/**
 * Validates a raw submission (form fields or JSON). Honeypot hits are reported separately so the caller can
 * answer with a neutral success and send nothing. Header-injection attempts in single-line fields are neutralised
 * (newlines become spaces) and, for the email field, rejected outright.
 */
/** Every field name the contact form sends. Anything else is rejected (a strict allowlist, like the intake handler). */
export const CONTACT_FIELDS: readonly string[] = [
  'name',
  'email',
  'inquiryType',
  'inquiry-type',
  'message',
  HONEYPOT_FIELD,
  ELAPSED_FIELD,
  SUBMISSION_ID_FIELD,
  TURNSTILE_RESPONSE_FIELD,
  'turnstileToken',
  'returnTo'
];

/** Names in the body that neither the form nor `extraFields` (contact.json) declares. Names only, never echoed to visitors. */
export function unexpectedFields(raw: Record<string, unknown>, extraFields: readonly string[] = []): string[] {
  const allowed = new Set([...CONTACT_FIELDS, ...extraFields]);
  return Object.keys(raw).filter((key) => !allowed.has(key));
}

export function parseContactInput(raw: Record<string, unknown>, overrides: Partial<ContactRules> = {}): ParseResult {
  const rules: ContactRules = { ...DEFAULT_RULES, ...overrides };
  const trap = raw[rules.honeypotField];
  if (trap !== undefined && trap !== null && String(trap).trim() !== '') return { kind: 'honeypot' };

  const errors: FieldErrors = {};

  const name = cleanSingleLine(raw.name, CONTACT_LIMITS.name);
  if (!name) errors.name = FIELD_ERRORS.nameRequired;
  else if (rawLength(raw.name) > CONTACT_LIMITS.name) errors.name = FIELD_ERRORS.nameLong;

  const email = cleanSingleLine(raw.email, CONTACT_LIMITS.email + 1);
  if (!email) errors.email = FIELD_ERRORS.emailRequired;
  else if (!isValidEmail(email)) errors.email = FIELD_ERRORS.emailInvalid;

  let inquiryType = cleanSingleLine(raw.inquiryType ?? raw['inquiry-type'], CONTACT_LIMITS.inquiryType + 1);
  if (inquiryType) {
    if (rules.inquiryTypes.length > 0 ? !rules.inquiryTypes.includes(inquiryType) : inquiryType.length > CONTACT_LIMITS.inquiryType) {
      errors.inquiryType = FIELD_ERRORS.inquiryInvalid;
      inquiryType = '';
    }
  }

  const message = cleanMultiline(raw.message, CONTACT_LIMITS.message + 1);
  if (!message) errors.message = FIELD_ERRORS.messageRequired;
  else if (message.length > CONTACT_LIMITS.message) errors.message = FIELD_ERRORS.messageLong;
  else if (message.length < rules.minMessageLength) errors.message = FIELD_ERRORS.messageShort;
  else if (countLinks(message) > rules.maxLinks) errors.message = FIELD_ERRORS.messageLinks;

  if (Object.keys(errors).length > 0) return { kind: 'invalid', errors };

  const idRaw = typeof raw[SUBMISSION_ID_FIELD] === 'string' ? (raw[SUBMISSION_ID_FIELD] as string).trim() : '';
  const elapsed = raw[ELAPSED_FIELD];
  return {
    kind: 'valid',
    submission: { name, email, inquiryType, message },
    turnstileToken: cleanSingleLine(raw[TURNSTILE_RESPONSE_FIELD] ?? raw.turnstileToken, CONTACT_LIMITS.token),
    returnTo: safeReturnPath(raw.returnTo),
    submissionId: SUBMISSION_ID_PATTERN.test(idRaw) ? idRaw : null,
    elapsedRaw: typeof elapsed === 'string' ? elapsed : undefined
  };
}

/** A same-site path for the no-JS redirect, or null. Blocks absolute URLs, protocol-relative URLs and backslashes. */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  if (!path || path.length > CONTACT_LIMITS.returnTo) return null;
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\x00-\x1F\x7F]/.test(path)) return null;
  return path;
}

export function wantsJson(accept: string | null | undefined, contentType?: string | null): boolean {
  if (contentType && contentType.toLowerCase().includes('application/json')) return true;
  return typeof accept === 'string' && accept.toLowerCase().includes('application/json');
}

/** Same-origin gate for the POST. A missing Origin is allowed (some privacy tools strip it); cross-site is not. */
export function isAllowedOrigin(headers: { origin?: string | null; secFetchSite?: string | null }, siteOrigin: string): boolean {
  if (headers.secFetchSite && headers.secFetchSite.toLowerCase() === 'cross-site') return false;
  if (!headers.origin) return true;
  return headers.origin === siteOrigin;
}

export function clientIp(headers: { get(name: string): string | null }): string {
  const ip = headers.get('cf-connecting-ip');
  return ip && ip.trim() ? ip.trim() : 'unknown';
}

/* ---------------------------------------------------------------- Turnstile */

export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface TurnstileOptions {
  secret: string;
  token: string;
  remoteIp?: string | null;
  expectedAction?: string;
  /** Hostname(s) the widget may have been solved on. Omit to skip the check. */
  expectedHostname?: string | readonly string[];
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export type TurnstileReason =
  | 'not-configured'
  | 'missing-token'
  | 'rejected'
  | 'action-mismatch'
  | 'hostname-mismatch'
  | 'unavailable';

export type TurnstileVerdict = { ok: true } | { ok: false; reason: TurnstileReason; codes?: string[] };

/** Cloudflare's published always-pass / always-fail / interactive test secrets (1x/2x/3x...AA). */
export function isTurnstileTestSecret(secret: string): boolean {
  return /^[123]x0+AA$/i.test(secret.trim());
}

/** Cloudflare's published test site keys (1x/2x/3x... AA, AB, FF). */
export function isTurnstileTestSiteKey(siteKey: string): boolean {
  return /^[123]x0+(?:AA|AB|FF)$/i.test(siteKey.trim());
}

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

/** Server-side Turnstile verification. Never throws: failures come back as a verdict. */
export async function verifyTurnstile(options: TurnstileOptions): Promise<TurnstileVerdict> {
  const secret = options.secret.trim();
  if (!secret) return { ok: false, reason: 'not-configured' };
  const token = options.token.trim();
  if (!token) return { ok: false, reason: 'missing-token' };

  const doFetch: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  let data: unknown;
  try {
    const body: Record<string, string> = { secret, response: token };
    if (options.remoteIp) body.remoteip = options.remoteIp;
    const response = await doFetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    data = await response.json();
  } catch {
    return { ok: false, reason: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }

  if (!data || typeof data !== 'object') return { ok: false, reason: 'unavailable' };
  const result = data as { success?: unknown; action?: unknown; hostname?: unknown; 'error-codes'?: unknown };
  const codes = Array.isArray(result['error-codes']) ? result['error-codes'].filter((c): c is string => typeof c === 'string') : [];
  if (result.success !== true) return { ok: false, reason: 'rejected', codes };

  // Test secrets return placeholder action/hostname values, so strict matching applies to real keys only.
  if (!isTurnstileTestSecret(secret)) {
    if (options.expectedAction && result.action !== options.expectedAction) return { ok: false, reason: 'action-mismatch' };
    if (options.expectedHostname) {
      const allowed = (Array.isArray(options.expectedHostname) ? options.expectedHostname : [options.expectedHostname]).map((h: string) =>
        h.toLowerCase()
      );
      const actual = typeof result.hostname === 'string' ? result.hostname.toLowerCase() : '';
      if (!allowed.includes(actual)) return { ok: false, reason: 'hostname-mismatch' };
    }
  }
  return { ok: true };
}

/* ------------------------------------------------------------- Rate limiting */

/** Workers Rate Limiting binding (see wrangler.contact.snippet.toml). Same shape the discovery template uses. */
export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface MemoryLimiter {
  hit(key: string): { allowed: boolean; retryAfter: number };
}

export interface MemoryLimiterOptions {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}

/** Sliding-window limiter held in the Worker isolate. Best effort (per isolate, reset on redeploy), bounded in memory. */
export function createMemoryLimiter(options: MemoryLimiterOptions): MemoryLimiter {
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 5000;
  const hits = new Map<string, number[]>();

  const prune = (current: number): void => {
    for (const [key, stamps] of hits) {
      if (!stamps.some((stamp) => current - stamp < options.windowMs)) hits.delete(key);
    }
    while (hits.size > maxKeys) {
      const oldest = hits.keys().next();
      if (oldest.done) break;
      hits.delete(oldest.value);
    }
  };

  return {
    hit(key) {
      const current = now();
      const recent = (hits.get(key) ?? []).filter((stamp) => current - stamp < options.windowMs);
      if (recent.length >= options.limit) {
        hits.delete(key);
        hits.set(key, recent);
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((recent[0] + options.windowMs - current) / 1000)) };
      }
      recent.push(current);
      hits.delete(key);
      hits.set(key, recent);
      if (hits.size > maxKeys) prune(current);
      return { allowed: true, retryAfter: 0 };
    }
  };
}

export interface RateDecisionInput {
  ip: string;
  binding?: RateLimiterBinding | null;
  fallback?: MemoryLimiter | null;
  group?: string;
  /** Seconds a blocked caller is told to wait when the binding blocks (the binding period, default 60). */
  bindingPeriodSeconds?: number;
}

export interface RateDecision {
  allowed: boolean;
  retryAfter: number;
  via: 'binding' | 'memory' | 'none';
}

/**
 * Per-IP decision: the Rate Limiting binding first (burst control across the location), then the optional
 * in-isolate window (longer horizon). A binding that errors is skipped, never fatal. With neither configured
 * the request is allowed, matching the discovery template; Turnstile still gates the submission.
 */
export async function decideRateLimit(input: RateDecisionInput): Promise<RateDecision> {
  const key = `${input.group ?? 'contact'}:${input.ip}`;
  if (input.binding) {
    try {
      const { success } = await input.binding.limit({ key });
      if (!success) return { allowed: false, retryAfter: input.bindingPeriodSeconds ?? 60, via: 'binding' };
    } catch {
      // Fall through to the in-isolate limiter.
    }
  }
  if (input.fallback) {
    const verdict = input.fallback.hit(key);
    if (!verdict.allowed) return { allowed: false, retryAfter: verdict.retryAfter, via: 'memory' };
    return { allowed: true, retryAfter: 0, via: 'memory' };
  }
  return { allowed: true, retryAfter: 0, via: input.binding ? 'binding' : 'none' };
}

/* --------------------------------------------------------------- Rendering */

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[ch] ?? ch;
  });
}

/** Subject line: single line, no control characters, capped. Safe against header injection by construction. */
export function buildSubject(prefix: string, inquiryType: string, name: string, submissionId?: string): string {
  const head = cleanSingleLine(prefix, 60);
  const inquiry = cleanSingleLine(inquiryType, CONTACT_LIMITS.inquiryType) || 'General inquiry';
  const from = cleanSingleLine(name, CONTACT_LIMITS.name);
  const id = submissionId ? ` ${cleanSingleLine(submissionId, 48)}` : '';
  return cleanSingleLine(`${head}${id} ${inquiry} from ${from}`, CONTACT_LIMITS.subject);
}

export function buildText(siteName: string, submission: ContactSubmission, receivedAt?: string, submissionId?: string): string {
  return [
    `New ${cleanSingleLine(siteName, 80)} contact form submission`,
    ...(submissionId ? [`Reference: ${cleanSingleLine(submissionId, 48)}`] : []),
    '',
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Inquiry type: ${submission.inquiryType || 'General inquiry'}`,
    ...(receivedAt ? [`Received: ${receivedAt}`] : []),
    '',
    submission.message
  ].join('\n');
}

export function buildHtml(siteName: string, submission: ContactSubmission, receivedAt?: string, submissionId?: string): string {
  const row = (label: string, value: string): string => `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`;
  return [
    `<h1>New ${escapeHtml(cleanSingleLine(siteName, 80))} contact form submission</h1>`,
    ...(submissionId ? [row('Reference', cleanSingleLine(submissionId, 48))] : []),
    row('Name', submission.name),
    row('Email', submission.email),
    row('Inquiry type', submission.inquiryType || 'General inquiry'),
    ...(receivedAt ? [row('Received', receivedAt)] : []),
    `<p><strong>Message:</strong></p><p>${escapeHtml(submission.message).replace(/\n/g, '<br>')}</p>`
  ].join('');
}

export interface ResultPageInput {
  ok: boolean;
  message: string;
  backHref: string;
  siteName: string;
  lang?: string;
}

/** Minimal standalone page for visitors without JavaScript when the form page cannot show the result itself. */
export function buildResultPage(input: ResultPageInput): string {
  const title = input.ok ? 'Message sent' : 'Message not sent';
  const back = safeReturnPath(input.backHref) ?? '/';
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(input.lang ?? 'en')}">`,
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark"><meta name="robots" content="noindex">',
    `<title>${escapeHtml(title)} - ${escapeHtml(cleanSingleLine(input.siteName, 80))}</title></head>`,
    `<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(input.message)}</p>`,
    `<p><a href="${escapeHtml(back)}">Back to the contact form</a></p></main></body></html>`
  ].join('');
}

/* ------------------------------------------------------------------ Config */

export interface ContactConfig {
  siteName: string;
  subjectPrefix: string;
  inquiryTypes: string[];
  minMessageLength: number;
  maxLinks: number;
  /**
   * "required" (default) fails closed when Turnstile is not configured; "optional" skips it when no secret is set
   * (not recommended); "off" never shows or verifies it: honeypot, time trap, rate limit and body cap carry the load.
   */
  turnstileMode: 'required' | 'optional' | 'off';
  /** Submissions faster than this after page load (set by the form script) are bots. 0 disables the trap. */
  minFillMs: number;
  /** Shown to visitors who cannot complete the spam check (no JavaScript). Public address only. */
  fallbackEmail: string;
  defaultReturnPath: string;
  /** Extra field names you added to the form; the handler rejects any field that is not declared here or built in. */
  extraFields: string[];
  memoryLimit: { limit: number; windowMs: number } | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const positiveInt = (value: unknown, fallback: number, max: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : fallback;

/** Normalises src/data/contact.json. Unknown or malformed values fall back to safe defaults. */
export function resolveContactConfig(json: unknown): ContactConfig {
  const j = isRecord(json) ? json : {};
  const siteName = cleanSingleLine(j.siteName, 80) || 'Website';
  const types = Array.isArray(j.inquiryTypes)
    ? j.inquiryTypes.map((t) => cleanSingleLine(t, CONTACT_LIMITS.inquiryType)).filter((t) => t.length > 0)
    : [];
  const turnstile = isRecord(j.turnstile) ? j.turnstile : {};
  // In-isolate limiter defaults to 5 messages per 10 minutes per IP; `"memory": false` or limit 0 turns it off.
  const memory = isRecord(j.rateLimit) ? j.rateLimit.memory : undefined;
  const rate = memory === false ? null : isRecord(memory) ? memory : {};
  const limit = rate ? positiveInt(rate.limit, 5, 1000) : 0;
  const windowMinutes = rate ? positiveInt(rate.windowMinutes, 10, 1440) : 0;
  const fallbackEmail = cleanSingleLine(j.fallbackEmail, CONTACT_LIMITS.email);
  return {
    siteName,
    subjectPrefix: cleanSingleLine(j.subjectPrefix, 60) || `[${siteName}]`,
    inquiryTypes: Array.from(new Set(types)),
    minMessageLength: positiveInt(j.minMessageLength, DEFAULT_RULES.minMessageLength, 500),
    maxLinks: positiveInt(j.maxLinks, DEFAULT_RULES.maxLinks, 50),
    turnstileMode: turnstile.mode === 'optional' ? 'optional' : turnstile.mode === 'off' ? 'off' : 'required',
    minFillMs: positiveInt(j.minFillMs, 2500, 60_000),
    fallbackEmail: isValidEmail(fallbackEmail) ? fallbackEmail : '',
    defaultReturnPath: safeReturnPath(j.defaultReturnPath) ?? '/contact/',
    extraFields: Array.isArray(j.extraFields) ? Array.from(new Set(j.extraFields.map((f) => cleanSingleLine(f, 60)).filter((f) => /^[A-Za-z][\w.-]*$/.test(f)))) : [],
    memoryLimit: rate && limit > 0 && windowMinutes > 0 ? { limit, windowMs: windowMinutes * 60_000 } : null
  };
}
