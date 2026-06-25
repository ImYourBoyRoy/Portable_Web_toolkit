---
name: site-starter
description: Bootstraps a brand-new Astro + Cloudflare client site from Portable_Web_toolkit site-starter templates. Use when creating a new client project folder, copying package.json/wrangler.toml, linking Web_Toolkit, or choosing Workers vs Pages deploy target.
---

# Site Starter

Creates a **new client site** outside the toolkit repo. Never use `Portable_Web_toolkit` root as the website.

## Workers vs Pages

| | **Workers** | **Pages** |
|---|-------------|-----------|
| Use when | SSR, API, KV/cron, `output: 'server'` | Static site, `output: 'static'` |
| Package | `site-starter/workers.package.json` → `package.json` | `site-starter/pages.package.json` → `package.json` |
| Wrangler | `workers.wrangler.toml` → `wrangler.toml` | `pages.wrangler.toml` → `wrangler.toml` |
| Profile | `"deployTarget": "workers"` | `"deployTarget": "pages"` |
| Discovery | `./dist/client` | `./dist` |

## Steps (Windows PowerShell 7+)

```powershell
$toolkit = "C:\path\to\Portable_Web_toolkit"
$site = "C:\sites\my-client"
New-Item -ItemType Directory -Path $site -Force | Out-Null
Set-Location $site

Copy-Item "$toolkit\site-starter\workers.package.json" .\package.json
Copy-Item "$toolkit\site-starter\workers.wrangler.toml" .\wrangler.toml
Copy-Item "$toolkit\site-starter\.env.example" .\.env.example
Copy-Item "$toolkit\site-starter\scripts" .\scripts -Recurse
cmd /c mklink /J Web_Toolkit "$toolkit\Web_Toolkit"

# Replace [PROJECT_NAME], [WORKER_NAME], [SITE_PROFILE] in package.json / wrangler.toml

npm install
node .\Web_Toolkit\init_site_profile\bin\init-site-profile.mjs
node .\Web_Toolkit\project_init\bin\project-init.mjs apply-safe --project-root .
node .\Web_Toolkit\site_readiness\bin\site-readiness.mjs run --project-root . --apply-safe-fixes
```

macOS/Linux: `ln -s "$toolkit/Web_Toolkit" ./Web_Toolkit`

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
- Junction `Web_Toolkit` or `web_toolkit` — match `package.json` paths  
