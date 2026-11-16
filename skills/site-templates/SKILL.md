---
name: site-templates
description: Install copy-ready Astro + Cloudflare site parts (layout/header/footer/nav, analytics consent, contact form with Turnstile, component CSS, fonts, base config) in one command, then verify forms with form-doctor. Use when building a new site or adding a header, footer, consent banner, contact or intake form, buttons/cards CSS, or font setup.
---

# Site Templates

Do not hand-write what a template already provides. One command copies files to the right places, adds CSS imports in valid order, installs prerequisites first, and prints the follow-up steps.

```bash
node ./Web_Toolkit/site_templates/bin/site-templates.mjs list                       # names, one line each
node ./Web_Toolkit/site_templates/bin/site-templates.mjs show layout                # what it installs/needs, README outline (~150 tokens)
node ./Web_Toolkit/site_templates/bin/site-templates.mjs show layout --section props   # one README section only
node ./Web_Toolkit/site_templates/bin/site-templates.mjs add layout analytics contact styles fonts --project-root .          # dry run
node ./Web_Toolkit/site_templates/bin/site-templates.mjs add layout analytics contact styles fonts --project-root . --apply
```

## Choose

| Need | Template |
|---|---|
| Page head/SEO, header with mobile menu, footer, breadcrumbs, skip link | `layout` |
| Consent banner (default off), GA4 / PostHog / Cloudflare Web Analytics after consent | `analytics` |
| Contact form: honeypot, rate limit, optional Turnstile, Workers `send_email`, draft + mailto fallback | `contact` |
| Long multi-section intake form with a strict field allowlist | `contact-intake` (on top of `contact`) |
| Buttons, cards, hero, forms, prose on theme tokens | `styles` |
| Self-hosted fonts and preload | `fonts` |
| Theme tokens, five themes | `theme` (via `site-theme apply`) |

`add` pulls in prerequisites itself (`theme`, `base`, `discovery`). Install only what the site needs: `contact-intake` is separate so a plain contact form carries no intake code.

## Workflow

1. `show <name>` for any template you will wire by hand; read one README section with `--section`, never the whole README.
2. Dry run, read the plan, then `--apply`. It never overwrites a changed file (`--force` does); edited data files (`site.json`, `nav.json`, `contact.json`) are kept.
3. Edit the copied data files, wire components as printed under `next`, run `site-theme apply paper ink` for tokens.
4. Build: `<pm> run check` then `<pm> run build`; then `stylesheet-check scan --root .`, `discovery-doctor` on `dist/`, and the `wcag-auditor` gate.
5. Forms: `node ./Web_Toolkit/form_doctor/bin/form-doctor.mjs scan --project-root .` (read-only), then `run --spawn` after a build. It probes a local Worker with a broken mail binding and fails a form that says "sent" when nothing was delivered.

## Rules

1. Components read contract tokens only (`--color-*`, `--space-*`); style through the theme, not by editing component CSS colors.
2. Replace placeholder origin, handle, and sender address before production; placeholders force `noindex` on purpose.
3. Do not weaken a form's honest status codes (4xx/5xx on failure) or remove the honeypot to make a test pass. Fix the cause.
4. Contact needs a verified sender and `send_email` binding; check against current Cloudflare docs before trusting the shipped snippet.
