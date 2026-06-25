# Site starter — new Astro + Cloudflare projects

Copy these files into a **new client site folder** (not into this toolkit repo root).

This repo (`Portable_Web_toolkit`) is the **toolkit distribution**. Your website lives in its own directory (for example `EmmyBarney/`) with a junction or copy of `Web_Toolkit/`.

## Pick a deploy target

| Target | Use when | Copy these → project root |
|--------|----------|---------------------------|
| **Workers** | SSR, API routes, KV/cron, `@astrojs/cloudflare` `output: 'server'` | `workers.package.json` → `package.json`, `workers.wrangler.toml` → `wrangler.toml` |
| **Pages** | Static/prerender marketing sites, `output: 'static'` | `pages.package.json` → `package.json`, `pages.wrangler.toml` → `wrangler.toml` |

Set `deployTarget` in your `*.site-profile.json` to `workers` or `pages` to match.

## Quick start (Windows PowerShell 7+)

```powershell
# 1. Create the client project folder
mkdir C:\sites\my-client-site
cd C:\sites\my-client-site

# 2. Copy starter files (Workers example)
Copy-Item C:\path\to\Portable_Web_toolkit\site-starter\workers.package.json .\package.json
Copy-Item C:\path\to\Portable_Web_toolkit\site-starter\workers.wrangler.toml .\wrangler.toml
Copy-Item C:\path\to\Portable_Web_toolkit\site-starter\.env.example .\.env.example
Copy-Item C:\path\to\Portable_Web_toolkit\site-starter\scripts .\scripts -Recurse

# 3. Link the toolkit (junction — preferred on Windows)
cmd /c mklink /J Web_Toolkit C:\path\to\Portable_Web_toolkit\Web_Toolkit

# 4. Replace placeholders in package.json and wrangler.toml
#    [PROJECT_NAME], [WORKER_NAME] or [PAGES_PROJECT_NAME], [SITE_PROFILE]

# 5. Bootstrap Astro + site profile
npm install
node .\Web_Toolkit\project_init\bin\project-init.mjs apply-safe --project-root .
node .\Web_Toolkit\init_site_profile\bin\init-site-profile.mjs
```

macOS / Linux: use `ln -s` instead of `mklink /J` for the toolkit link.

## Placeholders to replace

| Token | Where | Example |
|-------|--------|---------|
| `[PROJECT_NAME]` | `package.json` `name` | `emmy-barney` |
| `[WORKER_NAME]` | `wrangler.toml` (Workers) | `emmy-barney` |
| `[PAGES_PROJECT_NAME]` | `wrangler.toml` + `cf:deploy` (Pages) | `my-client-pages` |
| `[SITE_PROFILE]` | npm scripts | `emmy-barney.site-profile` |

## Astro config expectations

**Workers** (`workers.package.json`):

```js
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({ imageService: 'compile' }),
});
```

**Pages** (`pages.package.json`):

```js
export default defineConfig({
  output: 'static',
});
```

## Included helper scripts

Copy `site-starter/scripts/` to your project `scripts/`:

| Script | Purpose |
|--------|---------|
| `build-headers.mjs` | Deploy-time `_headers` via toolkit `headers-deploy` |
| `check-wrangler-versions.mjs` | Compare Wrangler vs npm latest |
| `clean-local-cache.mjs` | Clear `.astro`, `dist`, Vite cache |
| `readiness.mjs` | **Run-all** readiness report (`npm run readiness`) |

## Run-all readiness

After linking `Web_Toolkit`:

```powershell
npm run readiness
npm run readiness:fix   # apply-safe starter files first
```

Writes `output/site-readiness-*.json` and `.md` with PASS/WARN/FAIL/SKIP per phase.

## Toolkit path in npm scripts

Scripts reference `./Web_Toolkit/`. If your junction is named `web_toolkit` (lowercase), either rename the link or update script paths to match.

## Next steps

1. Create `BRAND_GUIDE.md` and `*.site-profile.json`
2. Copy secrets into `.env` (never commit)
3. `npm run build` → `discovery:doctor` on `./dist` or `./dist/client`
4. See `Web_Toolkit/OPERATIONS.md` for deploy and smoke sequence
