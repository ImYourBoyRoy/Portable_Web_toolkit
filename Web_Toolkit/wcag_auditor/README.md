# WCAG Auditor — Toolkit Bridge

Thin **site-profile** bridge for Portable Web Toolkit Astro/Cloudflare sites.

The accessibility engine itself lives in the standalone package:

```text
/home/v1x0r/Desktop/AI/wcag-auditor
@roydawsoniv/wcag-auditor
```

This module does **not** vendor the auditor core. It only adds toolkit conventions (`--site-profile`, Astro preview/`baseURL`, `output/wcag-auditor-*` reports, `site-doctor --wcag`).

## Resolve the core

| Method | Example |
|---|---|
| Sibling checkout (default) | `Portable_Web_toolkit/../../wcag-auditor` → `AI/wcag-auditor` |
| Env override | `export WCAG_AUDITOR_ROOT=/path/to/wcag-auditor` |
| npm / file dep in client | `npm i -D file:../../wcag-auditor` |

```bash
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs core-path
```

## When to use which

| Target | Use |
|---|---|
| Toolkit-managed Astro site | This bridge (`Web_Toolkit/wcag_auditor`) |
| Tauri / desktop / arbitrary app | Standalone `AI/wcag-auditor` directly |
| CI for a non-toolkit repo | Standalone package |

## Quick start (toolkit site)

```bash
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs init --site-profile ./site.site-profile.json
# in client: npm i -D playwright @axe-core/playwright && npx playwright install chromium
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run \
  --site-profile ./site.site-profile.json \
  --base-url http://127.0.0.1:4321
```

Ephemeral profile-driven run:

```bash
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run \
  --site-profile ./site.site-profile.json \
  --from-profile \
  --base-url http://127.0.0.1:4321
```

## Site profile knobs

`diagnostics.wcagAuditor`: `enabled`, `config`, `routes`, `baseURL`, `profile`, `manageServer`, `previewCommand`, `serverTimeoutMs`.

## Docs

- Standalone package: `../../wcag-auditor/README.md` (from this toolkit) / `AI/wcag-auditor`
- Deep architecture: `AI/wcag-auditor/docs/`
- This is an evidence gate — **not** a WCAG conformance certificate.
