# WCAG Auditor (toolkit-bundled)

Self-contained accessibility evidence gate for **Portable Web Toolkit website workflows**.

This module lives entirely under `Web_Toolkit/wcag_auditor/`. Website agents and CLIs must **not** resolve `AI/wcag-auditor` or any other tree outside the linked toolkit.

**Not a WCAG conformance certificate** — evidence gate only.

## Run

```bash
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs help
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs core-path
# → …/Web_Toolkit/wcag_auditor

node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs init --site-profile ./site.site-profile.json
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run --site-profile ./site.site-profile.json --base-url https://example.com
```

Peers in the **client** project (when using Playwright + axe):

```bash
npm install --save-dev playwright @axe-core/playwright
npx playwright install chromium
```

## Layout

```text
Web_Toolkit/wcag_auditor/
  bin/wcag-auditor.mjs     ← toolkit entry (--site-profile aware)
  src/                     ← full auditor core (bundled)
  src/toolkit/             ← site-profile / Astro helpers only
  docs/ examples/ tests/
```

`core-path` must always print this module directory (never an `AI/` sibling).

## Apps outside the toolkit

Non-website apps may keep a separate checkout or npm package if you want one. That path is **out of scope for toolkit-managed sites**.
