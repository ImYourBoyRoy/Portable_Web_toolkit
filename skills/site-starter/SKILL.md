---
name: site-starter
description: Bootstraps a brand-new Astro + Cloudflare client site from Portable_Web_toolkit site-starter templates. Use when creating a new client project folder, copying package.json/wrangler.toml, linking Web_Toolkit, or choosing Workers vs Pages deploy target.
---

# Site Starter

Creates a **new client site** outside the toolkit repo. Never use `Portable_Web_toolkit` root as the website.

## Preflight

Resolve applicable instructions for the parent workspace and intended client
repository. Select an exact target path, inspect it, and preserve unrelated
work. Refuse a non-empty target unless the user separately approves every
collision and its recovery plan.

Use the repository's current Node version on Windows, macOS, or Linux. Prefer
portable Node commands; adapt only path and shell quoting to the active host.

## Workers vs Pages

**Always ask the user before scaffolding** which deploy target they want:

| | **Workers** | **Pages (static)** |
|---|-------------|-------------|
| Ask when | Need SSR, API routes, built-in forms, Turnstile/server handlers, KV/D1/R2/cron, or other edge logic | Pure marketing/static site with no server runtime |
| Astro output | `output: 'server'` | `output: 'static'` |
| Package | `site-starter/workers.package.json` → `package.json` | `site-starter/pages.package.json` → `package.json` |
| Wrangler | `workers.wrangler.toml` → `wrangler.toml` | `pages.wrangler.toml` → `wrangler.toml` |
| Astro config | `astro.config.workers.example.mjs` → `astro.config.mjs` | `astro.config.pages.example.mjs` → `astro.config.mjs` |
| Profile | `"deployTarget": "workers"` | `"deployTarget": "pages"` |
| Discovery doctor | `./dist/client` | `./dist` |

Prefer **Workers** when the site will collect form submissions or need server APIs. Prefer **Pages static** only when the user confirms a static-only site.

After choosing a target, copy `.env.example` from `site-starter/` (sections A–D: required APIs, agent+user naming, recommended PostHog+GA4, optional features). User pastes section A secrets; agent proposes section B with the user; explain analytics early; do not require Porkbun.

## Portable scaffold transaction

1. Resolve the toolkit root, exact empty site target, deploy target, and source
   template files.
2. Produce a file plan for `package.json`, `wrangler.toml`,
   `astro.config.mjs`, `.env.example`, and `src/styles/`.
3. Stage those files outside the target and verify their source names and
   expected destination paths.
4. Create the target only after the plan is accepted, then move the staged
   scaffold into the empty target. Use the agent's ordinary filesystem tools
   or native host commands; do not present Bash syntax as cross-platform.
5. Link `Web_Toolkit` with:

```text
node "<toolkit-root>/scripts/link-web-toolkit.mjs" --toolkit-path "<toolkit-root>/Web_Toolkit" --project-root "<site-root>"
```

6. Copy and customize discovery templates according to
   `Web_Toolkit/templates/discovery/README.md`.
7. Obtain separate authorization before dependency installation or
   `project-init apply-safe`.
8. Create the site profile, run read-only readiness, and review its report.

## npm scripts → Web_Toolkit

Starter `package.json` calls toolkit CLIs directly (`./Web_Toolkit/...`). No local `scripts/` copy for headers, cache, wrangler check, or readiness.

## Discovery layer

Copy from `Web_Toolkit/templates/discovery/` per README: robots, sitemap, llms, humans, security.txt, content/search APIs, Schema.astro, middleware. Customize `site-config.ts` — no client-specific data in toolkit source.

## After scaffold

1. `BRAND_GUIDE.md` + `*.site-profile.json`
2. `.env` from `.env.example` (never commit)
3. `npm run build` → `npm run discovery:doctor`
4. **site-readiness** → **portable-web-toolkit** for deploy

## Rules

- Secrets in client `.env` only
- Link `Web_Toolkit` at project root before running npm scripts
- Structural `tokens.css` only — visual identity comes from each client's Brand Guide
- Never overwrite an existing project from a starter template
