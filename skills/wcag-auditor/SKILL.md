---
name: wcag-auditor
description: Run the Portable Web Toolkit WCAG evidence gate (WCAGate via site-profile wrapper). Use for a11y audits on toolkit-managed Astro sites. Never resolve AI/wcag-auditor. After every run, tell the user the gate and findings; share results.html path if present.
---

# WCAG Auditor

Use **only** `Web_Toolkit/wcag_auditor` (never `AI/wcag-auditor` or sibling trees).

The engine is **WCAGate** (`github:imyourboyroy/WCAGate`), installed into `Web_Toolkit/node_modules`. This CLI is the site-profile wrapper.

Evidence gate only — not a WCAG conformance certificate. Not a GUI.

## Prerequisites

1. Client project has a linked `Web_Toolkit/` and `*.site-profile.json`.
2. Playwright peers in the **client** project (`playwright`, `@axe-core/playwright`).
3. Chromium browser binary (`npx playwright install chromium`). The CLI auto-installs these unless `--skip-playwright-install`.
4. Engine present: `core-path` must contain `node_modules/@imyourboyroy/wcagate`. If missing: `cd Web_Toolkit && npm install --allow-git=all` (or let auto-ensure run).

## Preferred commands

```bash
# With site profile (ephemeral config if no wcag-auditor.config.mjs / wcagate.config.mjs)
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs doctor --site-profile ./<site>.site-profile.json
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run \
  --site-profile ./<site>.site-profile.json \
  --base-url https://example.com

# Persist a checked-in config
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs init --site-profile ./<site>.site-profile.json
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run --site-profile ./<site>.site-profile.json --base-url http://127.0.0.1:4321
```

Confirm: `node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs core-path` ends with `node_modules/@imyourboyroy/wcagate`.

Refresh engine without a toolkit version bump: `cd Web_Toolkit && npm run wcagate:update` (or `doctor --update-engine`).

## After every run — tell the user

1. Gate: exit `0` pass, `1` blocking, `2` execution/config/missing engine, `3` unresolved.
2. Each blocking or unresolved finding with `file:line` when mapped.
3. Optional HTML: `results.html` under the run output directory. Do not open it as a text file.
4. Prefer findings that show `file:line`. Unmapped rows still list the CSS selector.

## Rules

1. Pass `--site-profile` for toolkit sites.
2. Prefer live URL or local preview `--base-url`; do not invent routes.
3. Fix findings with smallest safe CSS/markup changes; re-run after fixes.
4. Do not treat PageSpeed Accessibility scores as WCAG proof.
5. Always state the gate and share the results HTML path after a run.
6. **Glassmorphism / frost UI is supported.** Axe `color-contrast` incompletes map to `cantTell` (exit 3 unresolved), not an auto-fail. Do **not** strip frost UI solely to silence the gate. Prefer: raise frost opacity / solid underlay under text → verify AA → complete `frost-glass-contrast` in `wcag-audit/manual-evidence.json` → bounded suppression with `outcomes: ["cantTell"]` for `axe/color-contrast`. See WCAGate `docs/GLASSMORPHISM.md`.
7. Never set `gate.unresolvedEvidence: "ignore"` just to ship glass; resolve evidence properly.
8. Never clone or patch `AI/wcag-auditor` for toolkit site work.
