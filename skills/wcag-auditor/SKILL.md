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
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run --site-profile ./<site>.site-profile.json --base-url http://127.0.0.1:<port>
```

### Coverage and adoption flags (WCAGate 2.4+; an older engine is refused, not silently ignored)

```bash
# Every page the site lists, in light and dark, at phone and desktop width
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run --site-profile ./<site>.site-profile.json \
  --base-url http://127.0.0.1:4321 --sitemap --color-schemes light,dark --viewports mobile,desktop

# Legacy site: record today's findings once, then only NEW findings block the gate
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run --site-profile ./<site>.site-profile.json --base-url http://127.0.0.1:4321 --write-baseline
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run --site-profile ./<site>.site-profile.json --base-url http://127.0.0.1:4321 --baseline
```

Use `--sitemap=<url|file>` to name a sitemap. Persist these in the profile under `diagnostics.wcagAuditor` (`sitemap`, `sitemapUrl`, `maxRoutes`, `matrix`, `baseline`, `unresolvedEvidence`). The baseline file (`wcag-audit/baseline.json`) belongs in version control; execution errors can never be baselined.

Confirm: `node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs core-path` ends with `node_modules/@imyourboyroy/wcagate`.

Refresh engine without a toolkit version bump: `cd Web_Toolkit && npm run wcagate:update` (or `doctor --update-engine`).

## After every run — tell the user

1. Gate: exit `0` pass, `1` blocking, `2` execution/config/missing engine, `3` unresolved.
2. Read the console output (WCAGate 2.4+ groups findings by root cause with each fix stated once, a few hundred tokens instead of the 100k+ raw JSON). Report each cause, its fix, and where it occurs (`file:line` when mapped). For one cause: `wcag-auditor report --site-profile <profile> --group g3`. **Do not read the run JSON whole.** The report also says what is NEW or fixed since the previous run.
3. Optional HTML: `results.html` under the run output directory. Do not open it as a text file.
4. Prefer findings that show `file:line`. Unmapped rows still list the CSS selector.

## Rules

1. Pass `--site-profile` for toolkit sites.
2. Prefer live URL or local preview `--base-url`; do not invent routes.
3. Fix findings with smallest safe CSS/markup changes; re-run after fixes.
4. Do not treat PageSpeed Accessibility scores as WCAG proof.
5. Always state the gate and share the results HTML path after a run.
6. **Glassmorphism / frost UI is supported.** WCAGate 2.4+ measures `color-contrast` incompletes from rendered pixels, so glass, gradients, and images either pass (and disappear) or become a real `failed` finding with a measured ratio and a suggested color. Fix those; do **not** strip frost UI wholesale. Only text it cannot measure (gradient-clipped, iframe, shadow DOM) stays `cantTell`; for that, raise frost opacity / add a solid underlay → verify AA → complete `frost-glass-contrast` in `wcag-audit/manual-evidence.json` → bounded suppression with `outcomes: ["cantTell"]`. See WCAGate `docs/CONTRAST.md` and `docs/GLASSMORPHISM.md`.
7. Never set `gate.unresolvedEvidence: "ignore"` just to ship glass; resolve evidence properly.
8. Never clone or patch `AI/wcag-auditor` for toolkit site work.
9. **Ports:** `--manage-server` starts the preview on a free port the toolkit owns and stops it afterwards; if the profile's port is busy (often the user's own dev server) it says so and leaves that process alone. For your own `--base-url` server pick the port with `dev-ports free`, and stop only what you started (`dev-ports release --port <n>`). Never stop someone else's process without the user's explicit yes for that pid.
