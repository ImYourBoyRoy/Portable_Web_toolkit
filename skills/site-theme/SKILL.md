---
name: site-theme
description: Install, validate, extract, and compare token-based themes on Portable Web Toolkit Astro sites (swap five themes on one site, turn a built site into a reusable theme). Use when asked to re-theme, try other looks, or reuse one site's design on another.
---

# Site Theme

A theme is a folder of CSS custom properties that implements `Web_Toolkit/templates/theme/tokens.contract.json`. Components read `var(--color-*)`, `var(--font-*)`, `var(--space-*)`, `var(--radius-*)`; brand palette names live only inside a theme. Swapping the theme file (or the `data-theme` attribute) re-skins the site. Astro has no theme runtime of its own, so this is plain CSS plus an attribute and works on any Astro version.

```bash
node ./Web_Toolkit/site_theme/bin/site-theme.mjs list
node ./Web_Toolkit/site_theme/bin/site-theme.mjs apply paper ink --pair paper,ink --project-root .
node ./Web_Toolkit/site_theme/bin/site-theme.mjs compare --url http://127.0.0.1:4321 --all --routes /
node ./Web_Toolkit/site_theme/bin/site-theme.mjs extract --url http://127.0.0.1:4321 --routes /,/about/ --name my-site
node ./Web_Toolkit/site_theme/bin/site-theme.mjs validate output/site-theme/my-site
node ./Web_Toolkit/site_theme/bin/site-theme.mjs export output/site-theme/my-site --as nomos   # into the user's theme library
node ./Web_Toolkit/site_theme/bin/site-theme.mjs map init --url http://127.0.0.1:4321         # link this site's variables to the contract
```

## Workflows

1. **Try themes on a site:** serve a production build, run `compare --all`, then show the user `output/site-theme/compare/index.html` (serve it; do not open as text). The result lists low-contrast text per theme. If the page background does not change, the site does not read the contract tokens: run `extract` once and pass its `theme-map.suggested.json` (review it) as `--map`.
2. **Reuse a site's design:** `extract` from its running build, review `tokens.css` (theme.json marks every token measured / derived / repaired / defaulted), `export --as <name>` into the library, then on the other site `map init` (once), `compare --themes <name>`, and `apply <name>`. The map is what lets a site with different variable names take the theme; review it and fill any roles it reports as unmapped.
3. **Normalize a site:** replace hardcoded colors/fonts in component CSS with contract tokens, keep the old brand names as aliases inside the theme, and re-run `compare`; the low-contrast count should reach zero for every shipped theme.
4. **Ship:** `apply` writes `src/styles/themes/*`, `src/data/themes.json`, and `src/components/theme/{ThemeInit,ThemeToggle,ThemePicker}.astro`. Wire `<ThemeInit />` first in `<head>`, set `<html data-theme>`, and put the toggle in the header. Remove `ThemePicker` for production unless a picker is a feature.

## Rules

1. Never apply a theme that fails `validate` (AA text pairs) unless the user insists; say which pair fails.
2. Extracted themes are drafts. State which tokens were derived or defaulted.
3. Do not edit a client Brand Guide's identity without being asked; a theme change is a visual change the user must see first (`compare`).
4. `compare` and `extract` need `playwright` in the project; use a production build, not the dev server.
