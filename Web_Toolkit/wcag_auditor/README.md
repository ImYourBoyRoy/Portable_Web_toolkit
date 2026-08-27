# WCAG Auditor (toolkit wrapper)

Site-profile bridge to **[WCAGate](https://github.com/imyourboyroy/WCAGate)** for Portable Web Toolkit website workflows.

This module does **not** contain the evidence engine. Agents and CLIs must call `Web_Toolkit/wcag_auditor` (this wrapper), never `AI/wcag-auditor`. The engine lands in `Web_Toolkit/node_modules/@imyourboyroy/wcagate`.

**Not a WCAG conformance certificate** — evidence gate only.

If the engine is missing, see [ENGINE.md](./ENGINE.md).

## Run

```bash
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs help
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs core-path
# → …/Web_Toolkit/node_modules/@imyourboyroy/wcagate

node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs doctor --site-profile ./site.site-profile.json
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs init --site-profile ./site.site-profile.json
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run --site-profile ./site.site-profile.json --base-url https://example.com
```

Peers in the **client** project (Playwright + axe). The wrapper auto-installs missing peers/Chromium unless `--skip-playwright-install`:

```bash
npm install --save-dev playwright @axe-core/playwright
npx playwright install chromium
```

With a site profile and no checked-in config, `run --site-profile …` implies ephemeral `--from-profile`. Checked-in configs may be `wcag-auditor.config.mjs` (toolkit) or `wcagate.config.mjs` (engine).

## After every run

1. Tell the user the gate: exit `0` pass, `1` blocking, `2` execution/config/missing engine, `3` unresolved.
2. List blocking and unresolved findings with `file:line` when present.
3. Optional HTML is `results.html` (or `wcag-audit-dashboard.html` alias). Do not open the HTML as a text file. Optional viewer: engine `wcagate serve`.

## Glassmorphism / frost UI

Frosted panels are first-class in WCAGate. Axe `color-contrast` incompletes map to `cantTell` (exit 3 unresolved), not an auto-fail. Do not strip frost UI solely to silence the gate.

See WCAGate `docs/GLASSMORPHISM.md` in the installed package or on GitHub. Toolkit example: `examples/astro/frost-canttell-suppression.example.mjs`.

## Layout

```text
Web_Toolkit/wcag_auditor/          ← wrapper (this repo)
  bin/wcag-auditor.mjs             ← agent-facing CLI
  src/toolkit/                     ← --site-profile, ephemeral Astro configs
Web_Toolkit/node_modules/@imyourboyroy/wcagate
                                   ← engine (npm git dep, not committed)
```

## Apps outside the toolkit

Use WCAGate directly: `npm install --save-dev github:imyourboyroy/WCAGate`. That path is out of scope for toolkit-managed sites.
