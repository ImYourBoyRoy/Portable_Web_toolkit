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

Peers in the **client** project (when using Playwright + axe). The toolkit CLI
auto-installs missing peers/Chromium unless `--skip-playwright-install`:

```bash
npm install --save-dev playwright @axe-core/playwright
npx playwright install chromium
```

With a site profile and no checked-in config, `run --site-profile …` implies
ephemeral `--from-profile` (valid `gate.unresolvedEvidence`: `error` | `ignore` only).

## Dashboard + source locate

After a run, open **`wcag-audit-dashboard.html`** under the client `output/` folder
(absolute path is printed by the CLI). The dashboard lists findings with
**file:line** when `source-locate` maps selectors/HTML classes into the project
`src/` tree.

Playwright Chromium is auto-prepared in the client project unless
`--skip-playwright-install` is passed.

## Glassmorphism / frost UI

Frosted panels and translucent “glass” are first-class. Axe often returns
**color-contrast incomplete** → outcome **`cantTell`** on those surfaces. That
is unresolved evidence, not a demand to remove the aesthetic.

Path: design for WCAG AA → verify with a contrast sampler → pass
`frost-glass-contrast` in `wcag-audit/manual-evidence.json` → add a bounded
suppression with `outcomes: ["cantTell"]` for `axe/color-contrast`.

Full guide: [`docs/GLASSMORPHISM.md`](./docs/GLASSMORPHISM.md). Examples:
`examples/astro/manual-evidence-frost.json`,
`examples/astro/frost-canttell-suppression.example.mjs`.

## Layout

```text
Web_Toolkit/wcag_auditor/
  bin/wcag-auditor.mjs     ← toolkit entry (--site-profile aware)
  src/                     ← full auditor core (bundled)
  src/core/source-locate.mjs
  src/reporters/dashboard.mjs
  src/toolkit/             ← site-profile / Astro helpers only
  docs/ examples/ tests/
```

`core-path` must always print this module directory (never an `AI/` sibling).

## Apps outside the toolkit

Non-website apps may keep a separate checkout or npm package if you want one. That path is **out of scope for toolkit-managed sites**.
