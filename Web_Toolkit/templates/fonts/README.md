# Font strategy

Self-host every font as woff2 from `@fontsource` packages, keep the theme in charge of which families are named, and
make the swap from fallback to web font invisible. `sync-fonts.mjs` does the mechanical part in one command.

## Why self-host

- No third-party request: no DNS/TLS to a font CDN on the critical path, no cookies, no GDPR exposure, one cache policy.
- Same-origin files can be preloaded and served with `Cache-Control: public, max-age=31536000, immutable`; the script
  content-hashes every file name, so a font update never serves a stale copy.
- The metric-matched fallback face removes the layout shift that Google Fonts CSS cannot.

## Wire it up

1. `pnpm add @fontsource-variable/dm-sans @fontsource/instrument-serif` (variable package when the family has one, else static).
2. Copy `sync-fonts.mjs`, `fonts-lib.mjs`, `woff2-metrics.mjs` to `scripts/fonts/`, `fonts.config.example.json` to `fonts.config.json`,
   `FontPreload.astro` to `src/components/`.
3. Edit `fonts.config.json`, then `node scripts/fonts/sync-fonts.mjs`. Add `"fonts": "node scripts/fonts/sync-fonts.mjs"` and run
   `... --check` in CI to catch drift.
4. `@import "./fonts.generated.css";` in `src/styles/global.css` (after `tokens.css`), and `<FontPreload />` in `<head>`.
5. Name the families in the theme (below). Commit `public/fonts/`, the generated CSS and the manifest.

## Config (`fonts.config.json`)

| Key | Meaning |
|---|---|
| `families[].family` | CSS family name; the fontsource id is its slug (`"DM Sans"` -> `dm-sans`, override with `id`) |
| `variable` / `weightRange` | `true` uses `@fontsource-variable/<id>` and one file for all weights (`[100, 900]` default) |
| `weights` | static families only: `[400, 700]`, each weight is one file |
| `styles` | `["normal"]` default, add `"italic"` only if the design uses it |
| `subsets` | `["latin"]` default (top level or per family); each subset gets its `unicode-range`, so extra subsets cost nothing unless used |
| `display` | `swap` default; per family override; see below |
| `preload` / `preloadWeights` | preload the normal/primary-subset file (400 or lightest weight by default); at most 2 files in total |
| `media` | wraps the faces in `@media`, e.g. `"(min-width: 641px)"`: phones never download them |
| `role`, `fallback` | `display`/`sans`/`mono` and `sans-serif`/`serif`/`monospace` (picks the system font the fallback is measured against) |
| `metrics` | optional manual `{unitsPerEm, ascent, descent, lineGap, xWidthAvg}`; omitted = measured from the woff2 |

Outputs: `public/fonts/*.woff2`, `src/styles/fonts.generated.css`, `src/styles/fonts.manifest.json` (files, byte sizes,
package versions, ready-made `stack` per family, preload list). Exit codes: 0 ok, 1 usage/crash, 2 invalid config, missing
package or file, or `--check` drift. A missing package prints the exact `pnpm add` / `npm install` command.

## font-display guidance

| Value | Use for |
|---|---|
| `swap` | The body and heading faces that define the brand; text shows at once in the metric-matched fallback, then swaps with almost no shift |
| `optional` | Non-critical or decorative faces (mono, accent, italics). The browser uses the font only if it arrives in about 100 ms, else keeps the fallback for that page view, so there is no swap at all. Pair with `media` to skip the download on phones |
| `fallback` | Short block, short swap window; a compromise when `optional` is too strict |
| `block` / `auto` | Avoid: invisible text for up to 3 s |

Rule of thumb: preload 1-2 files (the LCP heading and body regular), `swap` for those, `optional` for everything else.

## Tie to the theme contract

The contract (`../theme/tokens.contract.json`) fixes three tokens: `--font-display`, `--font-sans`, `--font-mono`. Components read
only those. A theme names the families, always ending in the fallback face and a system stack:

```css
--font-display: "Instrument Serif", "Instrument Serif Fallback", Georgia, "Times New Roman", serif;
--font-sans: "DM Sans", "DM Sans Fallback", ui-sans-serif, system-ui, sans-serif;
```

`fonts.manifest.json` -> `families[].stack` holds these strings. The shipped `studio` theme already names Instrument Serif
and DM Sans, and the other themes use system stacks, so fonts are opt-in per site and a theme swap needs no component edit.

## Tests

`node --test Web_Toolkit/templates/fonts/tests/*.test.mjs` covers config validation, `@font-face` output, the fallback
metric math, the woff2 reader (synthetic fonts), the manifest, and the CLI end to end against fake `@fontsource` packages.
