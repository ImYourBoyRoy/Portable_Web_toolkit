# START HERE — WCAG Auditor

**Purpose:** Evidence-oriented accessibility quality gate for websites and apps
that use Portable Web Toolkit.

This package does **not** invent a compliance percentage and does **not** certify WCAG conformance.

## Quick commands

```bash
# From a toolkit-managed project (preferred)
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs help
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs core-path
# → …/Web_Toolkit/wcag_auditor

node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs init --site-profile ./site.site-profile.json
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run --site-profile ./site.site-profile.json --base-url https://example.com

# Module self-check (toolkit maintainers)
cd Web_Toolkit/wcag_auditor && npm run check
```

## Consumers

| Consumer | Integration |
|---|---|
| Toolkit-managed Astro sites | `bin/wcag-auditor.mjs` with `--site-profile` |
| Apps using a global toolkit install | Same CLI under `<toolkit>/Web_Toolkit/wcag_auditor/` |
| Playwright + axe runs | Install peers in the **consumer** project |

## Read next

1. `README.md` — run, peers, layout
2. `docs/ARCHITECTURE.md` — evidence planes
3. `examples/` — basic, Astro, Tauri, Bevy, Godot
