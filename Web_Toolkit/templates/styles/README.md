# Component stylesheets

Eight small, token-only sheets that cover what nearly every site rebuilds: reset and type, long-form content, buttons,
cards, hero, section rhythm, form controls, layout utilities. They read the **theme contract**
(`../theme/tokens.contract.json`) and nothing else, so swapping the theme file re-skins the whole set. No hardcoded
colors, no font names, no custom properties defined here (stylesheet-check keeps tokens in `tokens.css`).

## Adopt (once per site)

1. Pick a theme and copy its tokens: `site-theme apply paper` (or copy `theme/themes/<name>/tokens.css` to `src/styles/tokens.css`).
2. Copy this folder (without `tests/` and this README) to `src/styles/components/`.
3. `src/styles/global.css`:
   ```css
   @import "./tokens.css";
   @import "./fonts.generated.css"; /* optional, see ../fonts/README.md */
   @import "./components/index.css";
   ```
4. Import `global.css` once from the root layout. Put `<a class="skip-link" href="#main">Skip to content</a>` first in `<body>`.
5. `stylesheet-check scan --root <site>` must stay at exit 0. Site-only styles go in `pages/` files that use the same tokens.

Cinematic motion (`../cinematic`) is additive and not duplicated here: components stay static, so a hero can be the LCP.

## Class API

| File | Classes (BEM: block, `__element`, `--modifier`) |
|---|---|
| `base.css` | Bare elements (headings, `p`, lists, links, media, `hr`, `code`), `.display` `.lead` `.eyebrow` `.caption` `.text-muted` `.text-sm` `.text-center` |
| `utilities.css` | `.container` (`--narrow` `--prose` `--full`), `.stack` (`--sm` `--lg` `--xl`), `.cluster` (`--center` `--end` `--between` `--start`), `.grid` (`--2` `--3` `--4` `--tight` `--loose`), `.measure` `.mx-auto` `.truncate` `.divider`, `.aspect-square` `.aspect-4-3` `.aspect-16-9` `.cover` `.rounded`, `.sr-only` `.visually-hidden` `.sr-only-focusable`, `.skip-link` |
| `button.css` | `.btn` (default look = secondary) with `--primary` `--secondary` `--ghost`, sizes `--sm` `--lg`, `--block` `--icon`, `.btn__icon`. States: `:disabled`, `[aria-disabled="true"]`, `.is-disabled`, `[aria-busy="true"]` |
| `card.css` | `.card` (`--raised` `--outline` `--flat` `--pad` `--link` `--horizontal`), `__media` `__body` `__eyebrow` `__title` `__text` `__meta` `__footer` `__link`, `.card-grid` |
| `section.css` | `.section` (`--tight` `--loose` `--flush` `--surface` `--raised` `--bordered` `--accent`), `__header` (`--center`) `__eyebrow` `__title` `__lead` `__actions`, `.cta-band` (`__body` `__title` `__text` `__actions`) |
| `hero.css` | `.hero` (`--surface` `--center` `--split` `--split-reverse` `--tall` `--media`), `__inner` `__content` `__eyebrow` `__title` `__lead` `__actions` `__meta` `__media` `__bg` |
| `form-controls.css` | `.form` (`__row` `__actions` `__honeypot`), `.field` (`__label` `__label--required` `__hint` `__error`), `.input` `.select` `.textarea`, `.check` (wraps a checkbox or radio), `.fieldset` (`--boxed` `__legend`), `.notice` (`--error`) |
| `prose.css` | `.prose` (`--wide` `--lg`) styles bare `h2`-`h6`, lists, `blockquote`, `pre`, `table`, `figure`, `details`; `.table-scroll` wraps wide tables |

Hero markup, card markup and the form field pattern are documented at the top of each file.

## How it responds to a theme swap

Every color, font, radius, shadow, space step and duration is a `var(--token)`, so `data-theme="ink"` (dark) or
`contrast` changes the whole site with no CSS edits. A theme that sets `--shadow-soft: none` gets flat cards for free
(cards keep their border). Choices that hold in all five shipped themes (tests enforce them):

- Control and button edges use `--color-border-strong`, which every theme keeps at 3:1 against page and surface (WCAG 1.4.11).
- Hover on primary buttons mixes 12% `--color-text` into `--color-accent`, which never drops below AA.
- Inside `.section--accent` the primary button inverts (accent text on the contrast color) so it stays visible.
- Errors never rely on color alone: invalid fields get a doubled edge and `.field__error` a "!" marker, both drawn in `--color-danger` (AA on page and surface in every theme).

## Tokens each file reads

| File | Tokens |
|---|---|
| `base.css` | `--color-bg/text/text-muted/link/accent/accent-contrast/border/focus`, `--font-display/sans/mono`, `--space-1/3/5`, `--line-height-body`, `--header-height`, `--dur-fast`, `--ease-out` |
| `utilities.css` | `--max-width-content`, `--space-2/3/4/5`, `--radius-md`, `--color-accent/accent-contrast/border/focus`, `--shadow-raised`, `--dur-fast`, `--ease-out` |
| `button.css` | `--color-*` (text, text-muted, bg, surface, surface-raised, accent, accent-contrast, link, focus), `--font-sans`, `--space-2/3/4/5`, `--radius-md/lg`, `--shadow-soft`, `--dur-fast`, `--ease-out` |
| `card.css` | `--color-surface/surface-raised/border/text/text-muted/focus`, `--font-display`, `--space-1..5`, `--radius-lg`, `--shadow-soft/raised`, `--dur-mid`, `--ease-out` |
| `section.css` | `--space-2..7`, `--color-bg/surface/surface-raised/border/text/text-muted/accent/accent-contrast`, `--font-display`, `--radius-lg`, `--shadow-soft` |
| `hero.css` | `--space-2..7`, `--color-bg/surface/border/text/text-muted`, `--font-display/sans`, `--max-width-content`, `--header-height`, `--radius-lg`, `--shadow-raised` |
| `form-controls.css` | `--color-text/text-muted/bg/surface/border/border-strong/danger/accent/accent-contrast/focus`, `--font-sans`, `--space-1..4`, `--radius-sm/md/lg`, `--line-height-body`, `--dur-fast`, `--ease-out` |
| `prose.css` | `--color-text/text-muted/border/surface/accent/accent-contrast/focus`, `--font-display/sans`, `--space-1..6`, `--radius-sm/md`, `--line-height-body`, `--header-height` |

## Accessibility and performance notes

- One focus ring everywhere: `2px solid var(--color-focus)`; no sheet removes an outline. Cards with `.card--link` ring the whole card.
- 44px minimum targets: `.btn` (even `--sm`), controls, `.check` rows, `.skip-link`.
- `base.css` carries the global reduced-motion guard; smooth scrolling, hover lift and the loading spinner only exist under `no-preference`.
- `forced-colors` rules keep edges and restore native selects and checkboxes in Windows High Contrast.
- Hero images should be a real `<img>`/`OptimizedPicture` with `fetchpriority="high"`, never a CSS background.
- Verify: `node --test Web_Toolkit/templates/styles/tests/*.test.mjs` and `stylesheet-check scan --root <site>`.
