# Layout template

Head, page shell, header, footer and breadcrumbs for an Astro + Cloudflare site, written against the
[theme token contract](../theme/tokens.contract.json) so any installed theme re-skins them. CSS reads only contract
tokens (no colours, no new custom properties). Core content, navigation and footer work with JavaScript off.

```
BaseHead.astro      charset, viewport, theme-color, ThemeInit, title/description/canonical/robots, icons, alternates, OG, Twitter
BaseLayout.astro    <html lang data-theme>, skip link first, header, <main id="main" tabindex="-1">, footer, Schema slot
SiteHeader.astro    brand + nav.json menu (one level of children), disclosure pattern, theme-toggle slot, sticky
SiteFooter.astro    footer.json columns, social, legal, copyright year, privacy-choices slot
Breadcrumbs.astro   visible trail + optional BreadcrumbList node (same @id as Schema.astro)
lib/head.ts         title, canonical, absolute URL, indexing, icons, social model   (erasable TS, unit tested)
lib/nav.ts          nav/footer parsing, aria-current matching, breadcrumb trail      (erasable TS, unit tested)
styles/             layout.css imports layout-shell, skip-link, header, nav, footer, breadcrumbs
*.example.json      site, nav, footer data shapes
```

## Wire it into a new site

Prerequisites: the [theme](../theme/README.md) (`site-theme apply`) and [discovery](../discovery/README.md) templates are
installed, and `astro.config.mjs` sets `site` to the production URL.

| Template path | Destination |
|---|---|
| `*.astro` | `src/components/layout/` |
| `lib/head.ts`, `lib/nav.ts` | `src/lib/` |
| `styles/*.css` | `src/styles/layout/` |
| `site.example.json`, `nav.example.json`, `footer.example.json` | `src/data/site.json`, `nav.json`, `footer.json` |

1. Copy the files and edit the three JSON files (read at build; invalid entries are dropped, never thrown on).
2. `src/styles/global.css` must `@import './themes/index.css';` (BaseLayout imports `global.css` and `layout/layout.css`).
3. Wrap pages: `<BaseLayout title="About" description="...">…</BaseLayout>`. Omit `title` on the home page.
4. Put the light/dark toggle in the header: `<ThemeToggle slot="theme-toggle" />` as a child of BaseLayout.
5. Add the real brand files to `public/`: `favicon.svg`, `apple-touch-icon.png`, `manifest.webmanifest`, and a 1200x630
   `og-default.png` (brand-doctor generates these). Nothing here ships a placeholder icon.
6. `npm run check`, `build`, then `discovery-doctor` on `dist/`.

## BaseLayout props and slots

Props: `title`, `description`, `canonical`, `ogImage`, `ogImageAlt`, `ogType` (`website|article|profile`),
`publishedTime`, `modifiedTime`, `noindex`, `robots`, `assetVersion`, `schemaType`, `lang`, `bodyClass`, `pageId`
(`data-page`), `stickyHeader` (default true), `showHeader`, `showFooter`, `breadcrumbs` (`true` derives from the URL, or
`[{ label, href }]`), `skipLabel`. BaseHead also takes `titleTemplate`, `themeColor`, `icons`, `markdownAlternate`.

Slots: `head` (page extras, last in `<head>`), `preload` (font preloads, right after ThemeInit), `schema` (replaces the
default `<Schema />`), `header`, `theme-toggle`, `before-main`, default, `after-main`, `footer`, `privacy-choices`.

## What BaseHead emits

- `<title>` via `formatTitle`: `About | Site Name`; home is the site name; no double branding. Template in `site.json`.
- Canonical is absolute with a trailing slash (same rule as discovery `canonicalPagePath`); query and hash are dropped.
- Robots is `noindex, nofollow` when the `noindex` prop is set, `PUBLIC_SITE_ENV` is set and not `production`, or the
  site host is a placeholder (`example.com`) or a preview host (`workers.dev`, `pages.dev`, `staging.`...). Set
  `PUBLIC_SITE_ENV=staging` in staging builds: prerendered HTML is fixed at build time, so the build profile decides.
- Open Graph and Twitter use an absolute `og:image` (default `site.json defaultOgImage`, optional `?v=` stamp),
  `summary_large_image`, and `twitter:site` only for a real handle (the `@yourhandle` placeholder is ignored).
- `rel=alternate` to the page's `index.md` twin and `/llms.txt` on indexable pages (pass `markdownAlternate={false}`
  on server-rendered pages, which have no twin).
- `theme-color` meta, then `<ThemeInit />` before any stylesheet; ThemeInit then keeps `theme-color` in step.

## Data files

- `site.json`: `siteName`, `tagline`, `defaultDescription`, `defaultOgImage` (+ alt, width, height), `locale`
  (`en_US`; also derives `<html lang>`), `titleTemplate`, `themeColor` (no-JS fallback), `twitter.site`, `origin`.
- `nav.json`: `brand` (`href`, `logo` SVG, `logoWidth/Height`, `showName`), `items` (`label`, `href`, `external`,
  `children[{label, href, description}]`; a parent without `href` is a submenu button), `cta`.
- `footer.json`: `tagline`, `columns[{title, links}]`, `social`, `legal`, `copyright{holder, text, startYear}`. The end
  year is computed at build, so a prerendered site shows the year of its last build.

## Accessibility behavior

- The skip link is the first element in `<body>` and targets `#main`; `<main tabindex="-1">` receives focus.
- No JS: the nav list renders inline and submenus are nested lists (dropdown on hover or focus-within on desktop).
- With JS (a short inline script in SiteHeader, run before first paint): the mobile menu and dropdowns become
  disclosure buttons with `aria-expanded` and `aria-controls`. Escape closes the innermost open menu and returns focus
  to its button; clicking outside closes; tabbing out of a dropdown closes it; crossing the 48rem breakpoint resets state.
- `aria-current="page"` only on the exact page; ancestors get `data-current="section"` (styling only).
- Targets are at least 2.75rem (44px). Focus rings use `--color-focus`. Transitions exist only under
  `prefers-reduced-motion: no-preference`. New-tab links carry a visually hidden notice.
- Sticky header: `<html data-sticky-header>` sets `scroll-padding-top: calc(var(--header-height) + var(--space-3))`, so
  focus and `#hash` jumps clear the header. In a custom scroll container repeat that calc on the container, or use
  `scroll-margin-top` on targets. Keep the real header at or below `--header-height` so the offset stays true.

## Composition

- Theme: BaseHead renders `ThemeInit`; `<html data-theme>` defaults to `themes.json default`. Pass `ThemeToggle` or
  `ThemePicker` through the `theme-toggle` slot. Re-theming needs no layout change.
- Discovery: `Schema.astro` is the default `schema` slot content and receives `title`, `description`, `schemaType`. It
  already emits a path-derived BreadcrumbList. Use `<Breadcrumbs jsonLd />` only when your labels differ from the
  slugs; it reuses the same `@id` (`<pageUrl>#breadcrumb`), so the two blocks describe one node.
- `lib/head.ts` mirrors `canonicalPagePath`, `markdownPathFor` and `isIndexableHost` from `discovery/lib/site.ts`; the
  tests fail if they drift. `lib/nav.ts` imports `./head.ts` with the extension so Node can run it directly.

## Tests

`node --test Web_Toolkit/templates/layout/tests/*.test.mjs`: unit tests for both libs, token-contract and
no-colour-literal checks on every sheet, JSON shape checks, header ARIA and skip-link wiring.
