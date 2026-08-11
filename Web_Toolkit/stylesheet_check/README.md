# Stylesheet Check

Enforces segregated CSS architecture for Astro (and Svelte/Vue) toolkit sites.

## Usage

```bash
node ./Web_Toolkit/stylesheet_check/bin/stylesheet-check.mjs scan --root <project>
# or from a client site:
npm run styles:check
```

## Checks

| Category | Severity | Rule |
|----------|----------|------|
| `inline-style` | error | Component `<style>` blocks over ~15 meaningful lines |
| `file-size` | error | Stylesheets over ~500 meaningful lines |
| `token-placement` | error | `--*` defined outside `tokens.css` / `styles/tokens/` |
| `duplicate-token` | error | Same custom property name in multiple files |
| `duplicate-rule` | warn | Same large rule block duplicated across files |
| `architecture` | error/warn | Astro: missing `tokens.css`; `global.css` should import tokens; Layout should import `global.css` once; warn when a flat `src/styles/` tree grows without `layout/` / `components/` |

## Scope

Focused on **Astro + external CSS** paths used by this toolkit. Deep React CSS-in-JS / nested SCSS frameworks are out of scope until a client needs them.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Clean |
| 2 | Errors or warnings |
| 1 | Usage / crash |
