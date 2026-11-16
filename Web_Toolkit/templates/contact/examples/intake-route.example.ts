// ./Web_Toolkit/templates/contact/examples/intake-route.example.ts
/**
 * Example wiring for a multi-field intake form (the pattern behind imyourboyroy.com/inquire/).
 * Copy to: src/pages/api/<your-endpoint>.ts, with lib/contact-lib.ts, lib/intake-lib.ts and lib/handle-intake.ts in
 * src/lib/contact/. Replace SCHEMA (every field the form may send, its type and limits) and CONFIG, add the
 * [[send_email]] and [[ratelimits]] bindings from wrangler.contact.snippet.toml (binding names below), then point
 * the form at the same path with method="post". Keep a drift test that reads the form markup and fails when a
 * named control is missing from SCHEMA (see the site's tests/inquiry-form.test.mjs for the pattern).
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleIntake, methodNotAllowed, type IntakeBindings, type IntakeConfig } from '../../lib/contact/handle-intake';
import type { IntakeSchema } from '../../lib/contact/intake-lib';

export const prerender = false;

const SCHEMA: IntakeSchema = {
  fields: [
    { name: 'name', label: 'Name', kind: 'line', section: 'Contact', required: true, max: 120 },
    { name: 'email', label: 'Email', kind: 'email', section: 'Contact', required: true },
    { name: 'topic', label: 'Topic', kind: 'select', section: 'Project', required: true, options: ['website', 'training', 'other'] },
    { name: 'message', label: 'Message', kind: 'text', section: 'Project', required: true, max: 3000 }
  ],
  internal: { honeypot: 'website_confirm', elapsed: 'form_elapsed', submissionId: 'submission_id', turnstile: 'cf-turnstile-response' },
  maxEntries: 40
};

const CONFIG: IntakeConfig = {
  siteName: 'Example Studio',
  subjectPrefix: 'Inquiry',
  recipient: 'you@example.com',
  sender: 'forms@example.com',
  senderName: 'Example Studio',
  fallbackEmail: 'you@example.com',
  formPath: '/contact/',
  maxBodyBytes: 32 * 1024,
  minFillMs: 2500,
  rateLimit: { bindingPeriodSeconds: 60, memory: { limit: 6, windowMs: 10 * 60_000 } },
  duplicateTtlMs: 60 * 60_000,
  turnstile: { enabled: false, action: 'intake' },
  nameField: 'name',
  emailField: 'email',
  topicField: 'topic',
  topicLabels: { website: 'Website', training: 'Training', other: 'Other' }
};

interface WorkerEnv {
  EMAIL?: IntakeBindings['mail'];
  FORM_RATE_LIMIT?: IntakeBindings['rateLimit'];
  TURNSTILE_SECRET_KEY?: string;
}

export const POST: APIRoute = ({ request, url }) => {
  const e = env as unknown as WorkerEnv;
  return handleIntake(request, url, { config: CONFIG, schema: SCHEMA, bindings: { mail: e.EMAIL, rateLimit: e.FORM_RATE_LIMIT, turnstileSecret: e.TURNSTILE_SECRET_KEY } });
};

export const ALL: APIRoute = () => methodNotAllowed();
