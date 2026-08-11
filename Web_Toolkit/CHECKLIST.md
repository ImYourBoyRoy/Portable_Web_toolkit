# Portable Toolkit Client Checklist

## Minimum required to start

- business name
- primary contact name and email
- production domain
- development/staging domain
- current registrar
- current DNS provider
- whether Cloudflare is already in use
- whether email is active on the domain
- mail provider if email exists
- available access method (API token, Wrangler auth, registrar access)

## Website requirements

- site type
- required pages
- preferred framework if fixed
- content owner
- brand assets
- accessibility expectations (WCAG target level + whether automated evidence gate is required)
- SEO requirements
- analytics requirements
- legal/privacy requirements

## Launch workflow

- does the client want preview approval before publish?
- who signs off before production deploy?
- is staging required?
- required launch date
- rollback expectations

## Integrations

- forms / CRM
- **analytics early** — explain PostHog (product/UX) and GA4 (Google ecosystem); prefer both unless declined
- email sending
- booking/scheduling
- payments
- auth requirements
- registrar access if toolkit will manage DNS/NS (**Porkbun is one example**, not required)

## Nice to collect early

- tone / brand style
- inspiration sites
- performance expectations
- multilingual needs
- maintenance expectations
- whether the client wants a sanitized toolkit copy later
- Google PageSpeed Insights API key (required for launch quality gates)
- PostHog project key + GA4 measurement id (recommended; wire slots even if keys come later)
