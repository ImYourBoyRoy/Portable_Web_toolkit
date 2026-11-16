// ./Web_Toolkit/templates/contact/lib/intake-lib.ts
/**
 * Pure logic for a multi-field intake form handler: strict per-field allowlist, length and type checks,
 * honeypot, time-to-submit trap, submission ids, duplicate suppression, bounded body reading and escaped
 * email rendering. No Cloudflare, Astro or DOM imports, and ERASABLE-SYNTAX TypeScript only (no enums,
 * namespaces or parameter properties) so Node can import it directly in tests.
 * Builds on contact-lib.ts (cleaning, email check, escapeHtml). Copy to: src/lib/contact/intake-lib.ts
 */
import { cleanMultiline, cleanSingleLine, escapeHtml, isValidEmail } from './contact-lib.ts';

export type FieldKind = 'line' | 'text' | 'email' | 'url' | 'tel' | 'select' | 'multi';

export interface FieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  /** Section heading used in the email. */
  section: string;
  required?: boolean;
  /** Maximum characters after cleaning. Defaults depend on the kind. */
  max?: number;
  /** Allowed values for `select` and `multi`. */
  options?: readonly string[];
  /** Human labels for option values, used in the email only. */
  optionLabels?: Readonly<Record<string, string>>;
  /** Maximum number of values for `multi`. Defaults to the option count. */
  maxItems?: number;
}

export interface IntakeSchema {
  fields: readonly FieldSpec[];
  /** Plumbing fields that are accepted but never rendered into the email. */
  internal: {
    honeypot: string;
    elapsed: string;
    submissionId: string;
    turnstile: string;
  };
  /** Hard cap on the number of entries in one submission. */
  maxEntries: number;
}

export const DEFAULT_MAX: Record<FieldKind, number> = {
  line: 200,
  text: 2000,
  email: 254,
  url: 300,
  tel: 40,
  select: 120,
  multi: 120
};

export type IntakeCode =
  | 'file_upload'
  | 'unexpected_field'
  | 'duplicate_field'
  | 'too_many_fields'
  | 'invalid_fields'
  | 'too_fast';

export type IntakeValues = Record<string, string | string[]>;

export interface IntakeMeta {
  submissionId: string;
  /** True when the id came from the client (so a retry can be recognised), false when the server made one. */
  clientId: boolean;
  elapsedMs: number | null;
  turnstileToken: string;
}

export type IntakeParse =
  | { kind: 'honeypot'; submissionId: string }
  | { kind: 'rejected'; status: 400 | 422; code: IntakeCode; fieldErrors?: Record<string, string> }
  | { kind: 'valid'; values: IntakeValues; meta: IntakeMeta };

const SUBMISSION_ID = /^[A-Za-z0-9_-]{8,48}$/;

export function isSubmissionId(value: unknown): value is string {
  return typeof value === 'string' && SUBMISSION_ID.test(value);
}

/** Random, non-guessable id for no-JS posts. Uses Web Crypto (Workers and Node 20+). */
export function newSubmissionId(prefix = 'srv'): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
  return `${prefix}-${body}`;
}

const FIELD_MESSAGES = {
  required: 'This field is required.',
  tooLong: (max: number): string => `Keep this under ${max} characters.`,
  email: 'Enter a valid email address, like name@example.com.',
  url: 'Enter a full web address that starts with http:// or https://.',
  tel: 'Enter a phone number using digits, spaces, + ( ) - . only.',
  option: 'Choose one of the listed options.'
} as const;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

const PHONE = /^[0-9+()\-.\sxX#]{3,40}$/;

function readText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function validateField(spec: FieldSpec, raw: string[]): { value?: string | string[]; error?: string } {
  const max = spec.max ?? DEFAULT_MAX[spec.kind];

  if (spec.kind === 'multi') {
    const options = spec.options ?? [];
    const picked: string[] = [];
    for (const item of raw) {
      const clean = cleanSingleLine(item, DEFAULT_MAX.multi);
      if (!options.includes(clean)) return { error: FIELD_MESSAGES.option };
      if (!picked.includes(clean)) picked.push(clean);
    }
    if (picked.length > (spec.maxItems ?? options.length)) return { error: FIELD_MESSAGES.option };
    if (spec.required && picked.length === 0) return { error: FIELD_MESSAGES.required };
    return { value: picked };
  }

  const text = raw[0] ?? '';
  const trimmed = text.trim();
  if (!trimmed) return spec.required ? { error: FIELD_MESSAGES.required } : { value: '' };
  if (trimmed.length > max) return { error: FIELD_MESSAGES.tooLong(max) };

  if (spec.kind === 'text') return { value: cleanMultiline(text, max) };

  const clean = cleanSingleLine(text, max);
  if (!clean) return spec.required ? { error: FIELD_MESSAGES.required } : { value: '' };
  switch (spec.kind) {
    case 'email':
      return isValidEmail(clean) ? { value: clean } : { error: FIELD_MESSAGES.email };
    case 'url':
      return isHttpUrl(clean) ? { value: clean } : { error: FIELD_MESSAGES.url };
    case 'tel':
      return PHONE.test(clean) ? { value: clean } : { error: FIELD_MESSAGES.tel };
    case 'select':
      return (spec.options ?? []).includes(clean) ? { value: clean } : { error: FIELD_MESSAGES.option };
    default:
      return { value: clean };
  }
}

/**
 * Parses submitted entries against the allowlist. Order matters: files and structure first (a client bug or
 * a probe, answered 400), then the honeypot (neutral for bots), then the time trap, then per-field validation.
 * Unknown fields are rejected, never silently dropped, so a form and its handler cannot drift apart unnoticed.
 */
export function parseIntake(entries: ReadonlyArray<readonly [string, unknown]>, schema: IntakeSchema, minFillMs: number): IntakeParse {
  if (entries.length > schema.maxEntries) return { kind: 'rejected', status: 400, code: 'too_many_fields' };

  const specs = new Map(schema.fields.map((field) => [field.name, field] as const));
  const internal = new Set(Object.values(schema.internal));
  const grouped = new Map<string, string[]>();

  for (const [name, value] of entries) {
    const text = readText(value);
    if (text === null) return { kind: 'rejected', status: 400, code: 'file_upload' };
    if (!specs.has(name) && !internal.has(name)) return { kind: 'rejected', status: 400, code: 'unexpected_field' };
    const list = grouped.get(name) ?? [];
    list.push(text);
    grouped.set(name, list);
  }

  const idRaw = grouped.get(schema.internal.submissionId)?.[0]?.trim() ?? '';
  const clientId = isSubmissionId(idRaw);
  const submissionId = clientId ? idRaw : newSubmissionId();

  const trap = grouped.get(schema.internal.honeypot)?.join('').trim() ?? '';
  if (trap) return { kind: 'honeypot', submissionId };

  for (const [name, list] of grouped) {
    const spec = specs.get(name);
    const repeatable = spec?.kind === 'multi';
    if (list.length > 1 && !repeatable) return { kind: 'rejected', status: 400, code: 'duplicate_field' };
  }

  // A missing value means no JavaScript set it (plain browser post); only a present, too-small value trips the trap.
  const elapsedRaw = grouped.get(schema.internal.elapsed)?.[0]?.trim();
  let elapsedMs: number | null = null;
  if (elapsedRaw !== undefined && elapsedRaw !== '') {
    elapsedMs = /^\d{1,9}$/.test(elapsedRaw) ? Number(elapsedRaw) : 0;
    if (elapsedMs < minFillMs) return { kind: 'rejected', status: 422, code: 'too_fast' };
  }

  const values: IntakeValues = {};
  const fieldErrors: Record<string, string> = {};
  for (const spec of schema.fields) {
    const result = validateField(spec, grouped.get(spec.name) ?? []);
    if (result.error) fieldErrors[spec.name] = result.error;
    else if (result.value !== undefined) values[spec.name] = result.value;
  }
  if (Object.keys(fieldErrors).length > 0) return { kind: 'rejected', status: 422, code: 'invalid_fields', fieldErrors };

  return {
    kind: 'valid',
    values,
    meta: {
      submissionId,
      clientId,
      elapsedMs,
      turnstileToken: cleanSingleLine(grouped.get(schema.internal.turnstile)?.[0], 2048)
    }
  };
}

/* ------------------------------------------------------------- Body reading */

export class BodyTooLargeError extends Error {
  constructor() {
    super('body too large');
    this.name = 'BodyTooLargeError';
  }
}

/**
 * Reads the request body with a hard byte cap. Content-Length is only a hint (it can be absent or wrong), so the
 * stream is counted as it arrives and cancelled at the limit.
 */
export async function readBodyLimited(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Parses a capped body as form data (urlencoded or multipart). Throws TypeError when it is not a form body. */
export async function parseFormBody(bytes: Uint8Array, contentType: string): Promise<Array<[string, unknown]>> {
  const data = await new Response(bytes as BodyInit, { headers: { 'content-type': contentType } }).formData();
  return Array.from(data.entries());
}

export function isFormContentType(contentType: string | null): boolean {
  const type = (contentType ?? '').toLowerCase();
  return type.startsWith('application/x-www-form-urlencoded') || type.startsWith('multipart/form-data');
}

/* ------------------------------------------------------------ Duplicate ids */

export interface RecentIds {
  has(id: string): boolean;
  add(id: string): void;
}

/** Bounded in-isolate memory of ids that were already accepted by the mail provider. Best effort by design. */
export function createRecentIds(options: { ttlMs: number; max?: number; now?: () => number }): RecentIds {
  const now = options.now ?? Date.now;
  const max = options.max ?? 500;
  const seen = new Map<string, number>();
  const prune = (): void => {
    const current = now();
    for (const [id, at] of seen) if (current - at >= options.ttlMs) seen.delete(id);
    while (seen.size > max) {
      const oldest = seen.keys().next();
      if (oldest.done) break;
      seen.delete(oldest.value);
    }
  };
  return {
    has(id) {
      const at = seen.get(id);
      if (at === undefined) return false;
      if (now() - at >= options.ttlMs) {
        seen.delete(id);
        return false;
      }
      return true;
    },
    add(id) {
      seen.delete(id);
      seen.set(id, now());
      if (seen.size > max) prune();
    }
  };
}

/* ---------------------------------------------------------------- Rendering */

function displayValue(spec: FieldSpec, value: string | string[]): string {
  const label = (item: string): string => spec.optionLabels?.[item] ?? item;
  return Array.isArray(value) ? value.map(label).join(', ') : label(value);
}

interface Row {
  label: string;
  value: string;
}

function groupRows(schema: IntakeSchema, values: IntakeValues): Array<{ section: string; rows: Row[] }> {
  const sections: Array<{ section: string; rows: Row[] }> = [];
  for (const spec of schema.fields) {
    const value = values[spec.name];
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    let group = sections.find((entry) => entry.section === spec.section);
    if (!group) {
      group = { section: spec.section, rows: [] };
      sections.push(group);
    }
    group.rows.push({ label: spec.label, value: displayValue(spec, value) });
  }
  return sections;
}

export interface IntakeMail {
  siteName: string;
  submissionId: string;
  receivedAt: string;
}

export function buildIntakeText(schema: IntakeSchema, values: IntakeValues, mail: IntakeMail): string {
  const lines = [`New ${mail.siteName} inquiry`, `Reference: ${mail.submissionId}`, `Received: ${mail.receivedAt}`, ''];
  for (const group of groupRows(schema, values)) {
    lines.push(`== ${group.section} ==`);
    for (const row of group.rows) lines.push(row.value.includes('\n') ? `${row.label}:\n${row.value}` : `${row.label}: ${row.value}`);
    lines.push('');
  }
  lines.push('Reply to this email to answer the visitor directly. The sender address on this message is the website, not the visitor.');
  return lines.join('\n');
}

export function buildIntakeHtml(schema: IntakeSchema, values: IntakeValues, mail: IntakeMail): string {
  const e = escapeHtml;
  const body = groupRows(schema, values)
    .map((group) => {
      const rows = group.rows
        .map((row) => `<tr><th align="left" valign="top" style="padding:4px 12px 4px 0;white-space:nowrap">${e(row.label)}</th><td style="padding:4px 0">${e(row.value).replace(/\n/g, '<br>')}</td></tr>`)
        .join('');
      return `<h3 style="margin:18px 0 6px">${e(group.section)}</h3><table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>`;
    })
    .join('');
  return [
    '<div style="font-family:sans-serif;line-height:1.5;max-width:640px;color:#111">',
    `<h2 style="margin:0 0 4px">New ${e(mail.siteName)} inquiry</h2>`,
    `<p style="margin:0;color:#555">Reference <strong>${e(mail.submissionId)}</strong> &middot; received ${e(mail.receivedAt)}</p>`,
    body,
    '<p style="margin-top:20px;color:#555">Reply to this email to answer the visitor directly. The sender address on this message is the website, not the visitor.</p>',
    '</div>'
  ].join('');
}

/** Subject: single line, id first so retries and duplicates are easy to spot in an inbox. */
export function buildIntakeSubject(prefix: string, submissionId: string, name: string, topic: string): string {
  return cleanSingleLine(`${prefix} ${submissionId}: ${name} (${topic})`, 150);
}

export interface IntakeResultPage {
  ok: boolean;
  title: string;
  message: string;
  reference?: string;
  backHref: string;
  siteName: string;
  /** Public address for the failure path. Rendered as a mailto link. */
  fallbackEmail?: string;
  mailtoSubject?: string;
}

/** Standalone, noindex result page for plain browser posts (no JavaScript). Every dynamic value is escaped. */
export function buildIntakeResultPage(input: IntakeResultPage): string {
  const e = escapeHtml;
  const reference = input.reference ? `<p>Reference: <strong>${e(input.reference)}</strong></p>` : '';
  const mailto =
    !input.ok && input.fallbackEmail
      ? `<p>You can also <a href="mailto:${e(input.fallbackEmail)}?subject=${e(encodeURIComponent(input.mailtoSubject ?? 'Inquiry'))}">send your inquiry by email</a>.</p>`
      : '';
  const back = input.ok
    ? ''
    : '<p>Use your browser&rsquo;s Back button to return to the form with your answers still in place.</p>';
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark"><meta name="robots" content="noindex">',
    `<title>${e(input.title)} | ${e(input.siteName)}</title>`,
    '<style>body{font-family:system-ui,sans-serif;line-height:1.55;margin:0;padding:2rem 1rem}main{max-width:36rem;margin:0 auto}a{text-underline-offset:.18em}</style>',
    '</head>',
    `<body><main><h1>${e(input.title)}</h1><p>${e(input.message)}</p>${reference}${back}${mailto}`,
    `<p><a href="${e(input.backHref)}">${input.ok ? 'Back to the site' : 'Back to the inquiry form'}</a></p></main></body></html>`
  ].join('');
}
