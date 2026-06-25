# Site starter — new Astro + Cloudflare projects

Copy these files into a **new client site folder** (not into this toolkit repo root).

This repo (`Portable_Web_toolkit`) is the **toolkit distribution**. Your website lives in its own directory (for example `my-client-site/`) with a link to `Web_Toolkit/`.

Cross-platform details: [`skills/CROSS_PLATFORM.md`](../skills/CROSS_PLATFORM.md)

## Pick a deploy target

| Target | Use when | Copy these → project root |
|--------|----------|---------------------------|
| **Workers** | SSR, API routes, KV/cron, `@astrojs/cloudflare` `output: 'server'` | `workers.package.json` → `package.json`, `workers.wrangler.toml` → `wrangler.toml` |
| **Pages** | Static/prerender marketing sites, `output: 'static'` | `pages.package.json` → `package.json`, `pages.wrangler.toml` → `wrangler.toml` |

Set `deployTarget` in your `*.site-profile.json` to `workers` or `pages` to match.

## Quick start (all platforms)

Set `TOOLKIT` to your Portable_Web_toolkit repo root and `SITE` to the new client folder.

```bash
# 1. Create the client project folder
mkdir -p "$SITE" && cd "$SITE"

# 2. Copy starter files (Workers example)
cp "$TOOLKIT/site-starter/workers.package.json" ./package.json
cp "$TOOLKIT/site-starter/workers.wrangler.toml" ./wrangler.toml
cp "$TOOLKIT/site-starter/.env.example" ./.env.example
cp -R "$TOOLKIT/site-starter/scripts" ./scripts

# 3. Link the toolkit (junction on Windows, symlink on macOS/Linux)
node "$TOOLKIT/scripts/link-web-toolkit.mjs" \
  --toolkit-path "$TOOLKIT/Web_Toolkit" \
  --project-root "$SITE"

# 4. Replace placeholders in package.json and wrangler.toml
#    [PROJECT_NAME], [WORKER_NAME] or [PAGES_PROJECT_NAME], [SITE_PROFILE]

# 5. Bootstrap Astro + site profile
npm install
node ./Web_Toolkit/project_init/bin/project-init.mjs apply-safe --project-root .
node ./Web_Toolkit/init_site_profile/bin/init-site-profile.mjs
```

**Windows (PowerShell 7+)** — use `Copy-Item` instead of `cp` if you prefer; the link step is the same `node .../link-web-toolkit.mjs` command.

## Placeholders to replace

| Token | Where | Example |
|-------|--------|---------|
| `[PROJECT_NAME]` | `package.json` `name` | `my-client-site` |
| `[WORKER_NAME]` | `wrangler.toml` (Workers) | `my-client-site` |
| `[PAGES_PROJECT_NAME]` | `wrangler.toml` + `cf:deploy` (Pages) | `my-client-pages` |
| `[SITE_PROFILE]` | npm scripts | `my-client-site.site-profile` |

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

```bash
npm run readiness
npm run readiness:fix   # apply-safe starter files first
```

Writes `output/site-readiness-*.json` and `.md` with PASS/WARN/FAIL/SKIP per phase.

## Toolkit path in npm scripts

Scripts reference `./Web_Toolkit/`. If your link is named `web_toolkit` (lowercase), either rename the link or update script paths to match.

## Next steps

1. Create `BRAND_GUIDE.md` and `*.site-profile.json`
2. Copy secrets into `.env` (never commit)
3. `npm run build` → `discovery:doctor` on `./dist` or `./dist/client`
4. See `Web_Toolkit/OPERATIONS.md` for deploy and smoke sequence
