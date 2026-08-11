# Performance Fixes

**Honest scope:** this module does **not** auto-fix Lighthouse scores or rewrite application code. It reads the latest diagnostic reports and applies a small set of **source-level, low-risk** remediations agents can run safely before deploy.

## What it actually does

| Command | Behavior |
|---------|----------|
| `recommend` | Reads latest `output/site-quality-smoke-*`, `output/browser-diagnostics-*`, and `output/pagespeed-*` JSON and prints ordered next commands. |
| `immutable-cache` | Creates or updates `public/_headers` so hashed `/_astro/*` assets can use long-lived immutable cache headers on Cloudflare Pages. |

It does **not** change live Cloudflare zone settings, purge caches, or patch JS/CSS bundles automatically.

## Commands

```bash
node ./Web_Toolkit/performance_fixes/bin/performance-fixes.mjs recommend --site-profile ../site-profiles/example-workers.json
node ./Web_Toolkit/performance_fixes/bin/performance-fixes.mjs immutable-cache --project-root /path/to/project --apply
```

## Inputs

- `site-quality_smoke` — asset cache header warnings
- `browser_diagnostics` — failed production requests
- `pagespeed_diagnostics` / `pagespeed-raw-*` — performance and cache insight scores (latest `pagespeed-*` JSON in `output/`)

Run PageSpeed and smoke checks first; `recommend` is a reader/orchestrator, not a substitute for those tools.
