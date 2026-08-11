---
name: wcag-auditor
description: Run the Portable Web Toolkit bundled WCAG accessibility evidence gate (Playwright + axe). Use for a11y audits on toolkit-managed Astro sites. Never resolve AI/wcag-auditor. Ensure Playwright Chromium is installed in the client project first. After every run, open and share the stakeholder dashboard HTML with the user.
---

# WCAG Auditor

Use **only** `Web_Toolkit/wcag_auditor` (never `AI/wcag-auditor` or sibling trees).

Evidence gate only — not a WCAG conformance certificate.

## Prerequisites

1. Client project has a linked `Web_Toolkit/` and `*.site-profile.json`.
2. Playwright peers in the **client** project (`playwright`, `@axe-core/playwright`).
3. Chromium browser binary (`npx playwright install chromium`). The CLI auto-installs these unless `--skip-playwright-install`.

## Preferred commands

```bash
# With site profile (ephemeral config if no wcag-auditor.config.mjs)
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run \
  --site-profile ./<site>.site-profile.json \
  --base-url https://example.com

# Persist a checked-in config
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs init --site-profile ./<site>.site-profile.json
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run --site-profile ./<site>.site-profile.json --base-url http://127.0.0.1:4321
```

Confirm: `node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs core-path` must end with `Web_Toolkit/wcag_auditor`.

## After every run — share the dashboard

1. Locate `wcag-audit-dashboard.html` under the run output directory (CLI prints `stakeholder dashboard → …`).
2. **Open it and share the path with the user** (Cursor canvas is optional extra; the HTML dashboard is the durable artifact).
3. Prefer findings that show `file:line` — those are best-effort maps from selectors/classes into `src/`. Unmapped rows still list the CSS selector for search.
4. JSON/SARIF remain for tools; dashboard is for humans.

## Rules

1. Pass `--site-profile` for toolkit sites.
2. Prefer live URL or local preview `--base-url`; do not invent routes.
3. Fix findings with smallest safe CSS/markup changes; re-run after fixes.
4. Do not treat PageSpeed Accessibility scores as WCAG proof.
5. Always surface the stakeholder dashboard path in the chat reply after a run.
6. **Glassmorphism / frost UI is supported.** Axe `color-contrast` incompletes map to `cantTell` (exit 3 unresolved), not an auto-fail. Do **not** strip frost UI solely to silence the gate. Prefer: raise frost opacity / solid underlay under text → verify AA with a contrast sampler → complete `frost-glass-contrast` in `wcag-audit/manual-evidence.json` → add a bounded suppression with `outcomes: ["cantTell"]` for `axe/color-contrast` on the route. See `Web_Toolkit/wcag_auditor/docs/GLASSMORPHISM.md`.
7. Never set `gate.unresolvedEvidence: "ignore"` just to ship glass; resolve evidence properly.
