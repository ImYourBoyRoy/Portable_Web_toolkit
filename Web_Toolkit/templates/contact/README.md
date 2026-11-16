# Contact form template

Accessible contact form for Astro + Cloudflare Workers with **honest delivery status**: a success response only after the
mail provider accepted the message (missing binding is 503, provider rejection is 502), honeypot, time-to-submit trap,
per-IP rate limiting, a streamed body cap, optional Cloudflare Turnstile (explicit render, verified server-side, loads on
first focus, `turnstile.mode: "off"` to skip it), a local draft with "Clear saved draft", Retry plus a prefilled
email fallback on failure, and a working no-JavaScript POST path. Mail goes through the Cloudflare Email Service
`send_email` binding. A multi-field intake variant (strict allowlist) ships in `lib/handle-intake.ts` and `examples/`.

## Copy map

Paths are relative to `Web_Toolkit/templates/contact/`.

| Template path | Client destination |
|---|---|
| `components/ContactForm.astro` | `src/components/contact/ContactForm.astro` |
| `lib/contact-lib.ts`, `lib/load-config.ts`, `lib/intake-lib.ts` (shared parsing helpers) | `src/lib/contact/` |
| `lib/handle-intake.ts` | `src/lib/contact/` only via `site-templates add contact-intake` |
| `scripts/form-draft.ts` | `src/scripts/form-draft.ts` (the draft store, used by the component) |
| `examples/intake-route.example.ts`, `examples/intake-form.example.ts` | not installed: copy and adapt for a multi-section intake form |
| `pages/api/contact.ts` | `src/pages/api/contact.ts` (prerender is already `false`) |
| `styles/contact-form.css` | `src/styles/components/contact-form.css` (import from the global CSS) |
| `contact.config.example.json` | `src/data/contact.json` (optional) |
| `wrangler.contact.snippet.toml` | merge into `wrangler.toml` |
| `contact.dev.vars.example` | `.dev.vars` for local runs |

Add `/api/contact` to `crawlerDisallow` in the discovery `site-config.ts`, and keep the form page's own route in
`run_worker_first` if you use the discovery Worker.

## Use

```astro
---
import ContactForm from '../components/contact/ContactForm.astro';
---
<h1>Contact</h1>
<ContactForm />
```

Props: `id`, `action` (default `/api/contact`), `returnTo`, `intro`, `messageHint`, `submitLabel`, `sendingLabel`,
`messages` (all status copy). Topics, limits and the subject prefix come from `src/data/contact.json`.

## Environment, secrets and bindings

| Name | Where | Purpose |
|---|---|---|
| `PUBLIC_TURNSTILE_SITE_KEY` | project `.env` (public, build time) | Turnstile widget |
| `TURNSTILE_SECRET_KEY` | `wrangler secret put` | siteverify, never a literal in source |
| `CONTACT_RECIPIENT_EMAIL` | `wrangler secret put` | where messages go (kept out of the bundle) |
| `CONTACT_FROM_EMAIL` | `wrangler secret put` | sender address, must be on a **verified** domain |
| `CONTACT_FROM_NAME` | `[vars]` | optional display name (default `siteName`); add the key to your existing `[vars]` table |
| `EMAIL` | `[[send_email]]` | Email Service binding, see `wrangler.contact.snippet.toml` |
| `CONTACT_RATE_LIMIT` | `[[ratelimits]]` | per-IP burst limit (3 per 60 s in the snippet) |

Sender requirement: Cloudflare Email Service only delivers from a domain you have onboarded and verified (DNS records),
and `CONTACT_FROM_EMAIL` must belong to it. Until then the route answers `503 not configured` and logs why. Run
`wrangler types` after editing `wrangler.toml`.

## Adding a field

The route is a strict allowlist: a body field that the form does not send and `contact.json` does not declare gets 422, and
`form-doctor` checks this. To add a field, add its input to `ContactForm.astro` and its name to `"extraFields"` in `src/data/contact.json`;
then read it in `parseContactInput` (or use `contact-intake` for a long form with a typed schema).

## How a submission is handled

1. Same-origin check (`Origin`, `Sec-Fetch-Site`), content-type check, per-IP rate limit (the binding first, then an
   in-isolate window; over the limit is `429` with `Retry-After`; a missing or failing binding never blocks visitors).
2. The body is read as a stream and counted against a 64 KB cap (`413`); `Content-Length` is only a hint.
3. Validation (`parseContactInput`): trimmed, control and bidi characters stripped, length limits, topic allow-list,
   link cap, minimum length. Header-injection text in name, topic or email is neutralised or rejected.
4. Honeypot (`company_url`, inert and off-screen): a filled field gets a neutral success and nothing is sent.
5. Time trap: `form_elapsed` (set by the form script) under `minFillMs` (default 2500) is `422`. A missing value, as with
   a plain browser post, passes.
6. Duplicate submission id: a retry of a message the provider already accepted is answered as success, not mailed twice.
7. Turnstile siteverify (skipped when `turnstile.mode` is `"off"`).
8. `EMAIL.send({ to, from, replyTo, subject, text, html })`. HTML is escaped; the visitor is `replyTo`, never `from`; the
   submission id is in the subject. A missing binding or address is `503`; a rejected send is `502`. Only a resolved
   send is `200`, and it means "accepted by the provider", not "delivered to an inbox".

Responses: JSON `{ ok, id }` or `{ ok:false, error, id, fieldErrors }` for fetch; otherwise a `303` to a same-site
`returnTo` (`?contact=sent|error`) or a minimal result page. Logs carry the id and an error class, never the message.

## Draft, retry and email fallback

`ContactForm.astro` autosaves a draft to `localStorage` (key `contact-draft:<path>:v1`, 7 days, debounced, fields in the
`draftExclude` prop never stored) and shows "Clear saved draft". The draft is deleted only after the server confirmed
success. On any failure (5xx, 429, offline) every answer stays in place, the status line names the submission reference,
and "Retry sending" plus "Send this by email instead" (a `mailto:` prefilled with the typed text, needs `fallbackEmail`)
appear. The same submission id is reused for retries until a success. Turn the draft off with `draft={false}`.

## Multi-section intake forms

For long forms use `lib/handle-intake.ts` with a schema: every allowed field with a type (`line`, `text`, `email`, `url`,
`tel`, `select`, `multi`), max length and options, an `internal` map for the plumbing fields, and a config object. Unknown
fields, repeated single fields and uploaded files are rejected (`400`), lengths are enforced not truncated (`422`).
`examples/intake-route.example.ts` is the route, `examples/intake-form.example.ts` the client (draft, retry, mailto).
Add a test that reads the form markup and fails when a named control is missing from the schema.

Verify any form with `form-doctor` (static scan plus a local probe with a broken mail binding):
`node Web_Toolkit/form_doctor/bin/form-doctor.mjs run --project-root . --spawn` after a build.

## No JavaScript

The form is a real `<form method="post" action="...">`, so a browser without JavaScript posts natively (never GET) and gets
a result page with the honest status code, a reference, and a `mailto:` link on failure. One honest limit: Turnstile needs
JavaScript, so with `turnstile.mode: "required"` (default, fail closed) a no-JS post is refused with a message pointing
to `fallbackEmail`. Mode `off` skips Turnstile entirely and leaves spam control to the honeypot, time trap (absent
without JavaScript, so it passes), rate limit and body cap: the recommended starting point for a small site, adding
Turnstile only when spam appears. Mode `optional` skips verification only when no secret is set.

## Local testing

1. `cp contact.dev.vars.example .dev.vars` (Cloudflare's published test keys: site `1x00000000000000000000AA`,
   secret `1x0000000000000000000000000000000AA`; use the `2x...` pair to see the failure path).
2. `npm run dev` (or `wrangler dev` on the build). Without a verified sender the route stops at 503 after Turnstile
   passes, which proves the whole path up to delivery. Set `remote = true` and a verified sender to send for real.
3. Test keys are refused off localhost by both the widget and the route, so they cannot ship by accident.
4. Local runs share one rate-limit key when `cf-connecting-ip` is absent; restart the dev server to reset it.

## Spam and abuse notes

- Layers: honeypot, Turnstile, per-IP limits, link cap, minimum length, same-origin check. None needs a third-party
  service. Add a Cloudflare WAF rate-limiting rule on `/api/contact` for sustained floods.
- Delivery errors are logged by class only (plus the short submission id); message bodies and addresses are never logged.
- The result of a honeypot or invalid post must stay indistinguishable for bots; do not add detail to those responses.
- Accessibility: labelled fields, 44px targets, `aria-invalid` plus text errors, one polite `aria-live` status region,
  focus moves to the first invalid field, no color-only states, `prefers-reduced-motion` respected.

## Tests

`node --test Web_Toolkit/templates/contact/tests/*.test.mjs` runs the validation, injection, honeypot, time trap,
rate-limit and Turnstile suites against `lib/contact-lib.ts`, the intake handler suite (`lib/handle-intake.ts` with a mocked
mail binding: success, missing binding, provider rejection, invalid, oversize, unexpected field, honeypot, rate limit,
duplicate id, no-JS, origin, Turnstile) and the draft store (`scripts/form-draft.ts`). All logic is erasable-syntax
TypeScript imported directly by Node, with an injected `fetch`. The token conformance test lives in `templates/analytics/tests/css-tokens.test.mjs`.
