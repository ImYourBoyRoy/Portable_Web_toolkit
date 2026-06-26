---
name: site-starter
description: Bootstraps a brand-new Astro + Cloudflare client site from Portable_Web_toolkit site-starter templates. Use when creating a new client project folder, copying package.json/wrangler.toml, linking Web_Toolkit, or choosing Workers vs Pages deploy target.
---

# Site Starter

Creates a **new client site** outside the toolkit repo. Never use `Portable_Web_toolkit` root as the website.

Cross-platform conventions: `skills/CROSS_PLATFORM.md`

## Workers vs Pages

| | **Workers** | **Pages** |
|---|-------------|-----------|
| Use when | SSR, API, KV/cron, `output: 'server'` | Static site, `output: 'static'` |
| Package | `site-starter/workers.package.json` → `package.json` | `site-starter/pages.package.json` → `package.json` |
| Wrangler | `workers.wrangler.toml` → `wrangler.toml` | `pages.wrangler.toml` → `wrangler.toml` |
| Astro config | `astro.config.workers.example.mjs` → `astro.config.mjs` | `astro.config.pages.example.mjs` → `astro.config.mjs` |
| Profile | `"deployTarget": "workers"` | `"deployTarget": "pages"` |
| Discovery doctor | `./dist/client` | `./dist` |

## Steps (all platforms)

Set paths (`TOOLKIT` = Portable_Web_toolkit repo root, `SITE` = new client folder).

```bash
mkdir -p "$SITE" && cd "$SITE"

cp "$TOOLKIT/site-starter/workers.package.json" ./package.json
cp "$TOOLKIT/site-starter/workers.wrangler.toml" ./wrangler.toml
cp "$TOOLKIT/site-starter/astro.config.workers.example.mjs" ./astro.config.mjs
cp "$TOOLKIT/site-starter/.env.example" ./.env.example
mkdir -p ./src/styles && cp -R "$TOOLKIT/site-starter/src/styles/"* ./src/styles/

node "$TOOLKIT/scripts/link-web-toolkit.mjs" \
  --toolkit-path "$TOOLKIT/Web_Toolkit" \
  --project-root "$SITE"

# Copy discovery templates — Web_Toolkit/templates/discovery/README.md
# Edit src/lib/site-config.ts and astro.config `site` URL

npm install
node ./Web_Toolkit/init_site_profile/bin/init-site-profile.mjs
node ./Web_Toolkit/project_init/bin/project-init.mjs apply-safe --project-root .
npm run readiness
```

**Windows (PowerShell 7+):** use `Copy-Item` instead of `cp`; same `link-web-toolkit.mjs` step.

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
