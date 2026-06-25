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
| Profile | `"deployTarget": "workers"` | `"deployTarget": "pages"` |
| Discovery | `./dist/client` | `./dist` |

## Steps (all platforms)

Set paths for your machine (`TOOLKIT` = Portable_Web_toolkit repo root, `SITE` = new client folder).

```bash
# 1. Create client folder
mkdir -p "$SITE" && cd "$SITE"

# 2. Copy starter files (Workers example — use pages.* for static Pages)
cp "$TOOLKIT/site-starter/workers.package.json" ./package.json
cp "$TOOLKIT/site-starter/workers.wrangler.toml" ./wrangler.toml
cp "$TOOLKIT/site-starter/.env.example" ./.env.example
cp -R "$TOOLKIT/site-starter/scripts" ./scripts

# 3. Link Web_Toolkit (junction on Windows, symlink elsewhere)
node "$TOOLKIT/scripts/link-web-toolkit.mjs" \
  --toolkit-path "$TOOLKIT/Web_Toolkit" \
  --project-root "$SITE"

# 4. Replace [PROJECT_NAME], [WORKER_NAME], [SITE_PROFILE] in package.json / wrangler.toml

npm install
node ./Web_Toolkit/init_site_profile/bin/init-site-profile.mjs
node ./Web_Toolkit/project_init/bin/project-init.mjs apply-safe --project-root .
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root . --apply-safe-fixes
```

**Windows (PowerShell 7+)** — same flow; use `Copy-Item` instead of `cp` if preferred:

```powershell
$TOOLKIT = "/path/to/Portable_Web_toolkit"
$SITE = "/path/to/my-client"
New-Item -ItemType Directory -Path $SITE -Force | Out-Null
Set-Location $SITE
Copy-Item "$TOOLKIT/site-starter/workers.package.json" .\package.json
Copy-Item "$TOOLKIT/site-starter/workers.wrangler.toml" .\wrangler.toml
Copy-Item "$TOOLKIT/site-starter/.env.example" .\.env.example
Copy-Item "$TOOLKIT/site-starter/scripts" .\scripts -Recurse
node "$TOOLKIT/scripts/link-web-toolkit.mjs" --toolkit-path "$TOOLKIT/Web_Toolkit" --project-root $SITE
```

## Astro config

**Workers:**

```js
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
export default defineConfig({ output: 'server', adapter: cloudflare({ imageService: 'compile' }) });
```

**Pages:**

```js
import { defineConfig } from 'astro/config';
export default defineConfig({ output: 'static' });
```

## After scaffold

1. `BRAND_GUIDE.md`  
2. `.env` from `.env.example` (never commit)  
3. **site-readiness** → **portable-web-toolkit** for build/deploy  

## Rules

- Secrets in client `.env` only  
- Junction/symlink `Web_Toolkit` or `web_toolkit` — match `package.json` paths  
