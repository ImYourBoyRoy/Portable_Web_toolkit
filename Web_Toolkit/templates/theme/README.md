# Theme system

A **theme** is a folder (`theme.json` + `tokens.css`) that fills in the token contract. A site's components only read
contract tokens, so one theme can be applied to many sites, and many themes can be tried on one site.

```
templates/theme/
  tokens.contract.json      the vocabulary every theme implements (+ the AA contrast pairs it must satisfy)
  themes/                   five starters: paper, ink, studio, glass-night, contrast (all AA-validated)
  ThemeInit.astro           inline no-flash script (saved choice -> system scheme -> default; keeps theme-color in step)
  ThemeToggle.astro         light/dark button for a theme pair
  ThemePicker.astro         dropdown over every installed theme (previews, "try five on this site")
```

Tool: `Web_Toolkit/site_theme` (`site-theme list | validate | apply | extract | compare`, skill `site-theme`).

## Does Astro support themes?

Not as a runtime feature. The Astro "themes" gallery is whole-site starters, and Starlight has its own theme layer. What
works across every Astro version, and what this uses, is CSS custom properties selected by `:root[data-theme="name"]`.
That gives all three things you asked for with no framework coupling:

| Goal | How |
|---|---|
| Swap themes on a site | change `data-theme` (build default in `src/data/themes.json`, runtime via `ThemeToggle`/`ThemePicker`) |
| Compare 5 themes on one site | `site-theme compare --all`: injects each theme into the live page, screenshots every route, counts low-contrast text, writes `index.html` |
| Export a site's look as a theme | `site-theme extract --url <preview>`: measures colors, fonts, radii; writes a draft theme with provenance per token |
| Reuse it on another site | `site-theme apply --source output/site-theme <name>` there |

Themes cover **tokens** (color, type, space, radius, shadow, motion, layout). Structure (different header/footer/hero
markup) is not a theme; that stays a template/component decision.

## Exporting a theme and using it on another site

```bash
# 1. measure the source site (a running production build), review the draft
site-theme extract --url http://127.0.0.1:4950 --name nomos --project-root <any site with playwright>
# 2. put it in your library under any name (~/.portable-web-toolkit/themes; override with PORTABLE_TOOLKIT_THEMES)
site-theme export output/site-theme/nomos --as nomos --label "Nomos"
# 3. on the target site: link its variable names to the contract ONCE, then try the theme
site-theme map init --url http://127.0.0.1:4951 --project-root .
site-theme compare --themes nomos,paper,studio --url http://127.0.0.1:4951
site-theme apply nomos paper --pair paper,nomos          # writes themes + compat.css + themes.json
```

The "cross-link" is `src/styles/themes/theme-map.json`: for each contract role, the target site's own variable names
(`--color-bg: ["--bg"]`). `map init` fills it by matching the site's variables to what the page actually renders (a variable
equal to the measured background is the background role), falling back to names. `apply` turns it into `compat.css`
(`:root[data-theme] { --bg: var(--color-bg); }`), so the site keeps its own names and any theme drives it. The map covers
variables, not structure: components that hardcode colors stay unthemed (`compare` counts them), and structural differences
(different header markup) are a template choice. Verified: Nomos's extracted theme re-skinned ReadyForUs (dark base, cyan accent,
display serif) through this map alone.

## Making a site theme-able (one-time)

Survey of nine of your sites: three naming dialects (`--color-*`, short `--bg/--surface/--text`, brand-named palettes),
only two sites handle light and dark, and brand names leak into component CSS and layouts. To normalize a site:

1. `site-theme extract --url <preview> --name <site>` and read `theme-map.suggested.json` (your own variable names mapped
   onto the contract).
2. Component CSS reads `var(--color-*)`/`var(--font-*)`/etc. Keep old brand names as aliases **inside** the theme file
   (`--gold: var(--color-accent)`), never the other way around.
3. `site-theme compare --all --map <map.json>`: the low-contrast count per theme shows what is still hardcoded.
   (On a real site the dark themes flagged 22 text nodes that ignored the tokens.)
4. `site-theme apply <names> --pair light,dark`; wire `ThemeInit`, the toggle, and `@import './themes/index.css'`.

## The contract

See `tokens.contract.json`. Contrast pairs enforced at AA: text and muted text on both background and surface, link on
background, accent-contrast on accent, focus ring (3:1) on background. `validate` and `apply` refuse a theme that fails
unless `--allow-contrast-failures`.

## Shipped from the site survey

Analytics consent, contact form, layout (head/header/footer/nav), font strategy, and component CSS are now installable templates:
see `../../Web_Toolkit/TOOLKIT_TEMPLATES.md` and `site-templates list`. Still recyclable but not yet templates: brand/asset
scripts (icon and OG generators; candidates for `brand-doctor`) and the site-specific `StoreChips`-style components.
