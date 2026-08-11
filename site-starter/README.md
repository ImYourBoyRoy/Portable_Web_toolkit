# Site starter — new Astro + Cloudflare projects

Copy these files into a **new client site folder** (not into this toolkit repo root).

Requires **`Web_Toolkit/`** linked at the project root (`node …/link-web-toolkit.mjs`).

**Baseline:** match root `VERSION` / `.node-version` / site-starter pins (refresh with `node ./scripts/sync-readme-versions.mjs`). TypeScript stays on `^6.0.3` until `@astrojs/check` peers allow 7.x.

Cross-platform: [`docs/agent-skills/CROSS_PLATFORM.md`](../docs/agent-skills/CROSS_PLATFORM.md)

## Pick a deploy target

**Ask the user first** — do not assume:

| Target | When to choose | Copy → project root |
|--------|----------------|---------------------|
| **Workers** | SSR, API routes, **built-in forms**, Turnstile/server handlers, Workers bindings | `workers.package.json` → `package.json`, `workers.wrangler.toml` → `wrangler.toml`, `astro.config.workers.example.mjs` → `astro.config.mjs` |
| **Pages (static)** | Static HTML/assets only; no server runtime | `pages.package.json` → `package.json`, `pages.wrangler.toml` → `wrangler.toml`, `astro.config.pages.example.mjs` → `astro.config.mjs` |

Set `deployTarget` in `*.site-profile.json` to `workers` or `pages`.

Copy [`.env.example`](./.env.example) into the project (includes `GOOGLE_PAGESPEED_API_KEY` and other toolkit API slots). Live secrets go only in project-root `.env`.

## Quick start

```bash
mkdir -p "$SITE" && cd "$SITE"

cp "$TOOLKIT/site-starter/workers.package.json" ./package.json
cp "$TOOLKIT/site-starter/workers.wrangler.toml" ./wrangler.toml
cp "$TOOLKIT/site-starter/astro.config.workers.example.mjs" ./astro.config.mjs
cp "$TOOLKIT/site-starter/.env.example" ./.env.example
cp -R "$TOOLKIT/site-starter/src/styles" ./src/styles

node "$TOOLKIT/scripts/link-web-toolkit.mjs" \
  --toolkit-path "$TOOLKIT/Web_Toolkit" \
  --project-root "$SITE"

# Copy discovery layer — see Web_Toolkit/templates/discovery/README.md
# Edit src/lib/site-config.ts, astro.config site URL, package.json placeholders

npm install
node ./Web_Toolkit/init_site_profile/bin/init-site-profile.mjs
node ./Web_Toolkit/project_init/bin/project-init.mjs apply-safe --project-root .
npm run readiness
```

## npm scripts → Web_Toolkit

After linking `Web_Toolkit/`, starter `package.json` scripts call toolkit CLIs directly:

| Script | Toolkit entry |
|--------|----------------|
| `build:headers:*` | `Web_Toolkit/headers_deploy/bin/headers-deploy.mjs` |
| `clean:cache` | `Web_Toolkit/scripts/clean-local-cache.mjs` |
| `check:wrangler` | `Web_Toolkit/scripts/check-wrangler-versions.mjs` |
| `readiness` | `Web_Toolkit/site_readiness/bin/site-readiness.mjs` |
| `discovery:doctor` | `Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs` |
| `quality:smoke` | `Web_Toolkit/site_quality_smoke/...` |
| `styles:check` | `Web_Toolkit/stylesheet_check/...` |

No duplicate `scripts/` folder in the client project for these — the toolkit is the source of truth.

## Placeholders

| Token | Where |
|-------|--------|
| `[PROJECT_NAME]` | `package.json` |
| `[WORKER_NAME]` / `[PAGES_PROJECT_NAME]` | `wrangler.toml`, deploy scripts |
| `[SITE_PROFILE]` | `quality:smoke` site profile path |
| `your-production-domain.example` | `astro.config.mjs` `site` |

## Structural CSS only

`src/styles/tokens.css` and `global.css` are **system tokens** (fonts, spacing) — not a visual theme. Each client gets its own Brand Guide and component styles.

## Discovery layer

Full copy list: [`Web_Toolkit/templates/discovery/README.md`](../Web_Toolkit/templates/discovery/README.md)

## Next steps

1. `BRAND_GUIDE.md` + `*.site-profile.json`
2. Secrets in `.env` (never commit)
3. `npm run build` → `npm run discovery:doctor`
4. [`Web_Toolkit/OPERATIONS.md`](../Web_Toolkit/OPERATIONS.md)
