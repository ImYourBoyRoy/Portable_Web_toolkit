# Cinematic Page Templates

Copy-ready motion and layout primitives for premium Astro pages that still score 100 on PageSpeed. Extracted from the
imyourboyroy.com homepage redesign (motion policy v2, 2026-11-14). **No client copy or brand colors**: everything reads
the site's own tokens (`--accent`, `--accent-h/s/l`, `--border`, `--font-display`, `--font-mono`, `--ease-out`).

## Copy map

| Toolkit path | Client destination | Purpose |
|--------------|--------------------|---------|
| `styles/motion.css` | `src/styles/motion.css` (import from the layout) | View Transitions, scroll-driven `.rise .draw .ln .roll .wipe`, CSS scroll-progress bar, reduced-motion guard |
| `styles/page-system.css` | `src/styles/components/page-system.css` | `.h-wrap`, `.h-index` (replaces pill badges), `.h-title`, `.link-arrow`, `.ledger`, flat buttons |
| `styles/tokens/page-wide.css` | `src/styles/tokens/page-wide.css` | `--gut --wrap --rule --section-y`, scoped to `<main class="page-wide">` |
| `styles/hero-field.css` | `src/styles/pages/home/hero.css` (or import) | CSS poster plus canvas fade-in |
| `scripts/hero-field.ts` | `src/scripts/hero-field.ts` | Optional WebGL2 contour-field hero (one fullscreen triangle) |
| `scripts/mount-hero-field.snippet.astro` | bottom of the page with the hero | Idle-after-load mount with all guards |
| `scripts/circuit-trace.ts` | `src/scripts/circuit-trace.ts` | Cursor-driven circuit board: traces, pads and chips revealed around the pointer with pulses along the traces. 2D canvas, built on the first real mouse move, stops drawing when the pointer stops. Mount from the layout after load and idle, any window wider than 820px with a fine pointer (do not require 1024px or `hover: hover`; embedded browsers can be narrower and report differently): `import('../scripts/circuit-trace').then((m) => m.mountCircuit())`. Add `.circuit-canvas { position: fixed; inset: 0; z-index: 1; width: 100vw; height: 100vh; pointer-events: none; }` |

## The performance contract (non-negotiable)

1. The LCP element is static text or a static image that paints without JavaScript. Never gate it with opacity or a reveal.
2. Motion is CSS-first: `animation-timeline`, View Transitions, `transform`, `opacity`, `clip-path`. No scroll listeners.
3. Heavy effects (canvas/WebGL) load after `load` and idle, only on desktop with a fine pointer and no reduced motion,
   never cause layout shift, and start from a CSS poster. `hero-field.ts` also refuses software rasterizers (SwiftShader,
   llvmpipe) so PageSpeed's headless Chrome and GPU-less users keep the poster and the score.
4. Everything is inside `@media (prefers-reduced-motion: no-preference)` or `@supports (animation-timeline: ...)`;
   unsupported browsers and reduced-motion users get the final, static layout.
5. Mobile gets short opacity/translate reveals only: no wipes, no pinning, no canvas.
6. No 3D card tilt and no hard-edged spotlight. Pointer effects only on `(pointer: fine)` desktop mice.

Verify with `preview-check` (`motion`, `layout`, `lighthouse`) against a production build, not the dev server.

## Wiring

1. Import `motion.css` in the layout; `page-system.css` and `tokens/page-wide.css` in the page CSS entry.
2. Put `class="page-wide"` on `<main>`; use `.h-wrap` for the wide wrapper (1320px, fluid gutters).
3. Section header: `<p class="h-index">02 Work</p>` then `<h2 class="h-title"><span class="ln"><span>Line one</span></span> <span class="ln"><span>line two.</span></span></h2>`
   (keep the literal space between line spans so screen readers read two words).
4. Images: `<figure class="shot wipe">` wipes in on desktop; use the wipe keyframe variants for direction.
5. Pinned chapters: `.chapter { height: 175vh; view-timeline: --chapter block }` with a sticky `.scene`; children animate
   against `animation-timeline: --chapter`. Only at `min-width: 821px`.
6. Hero field: add `hero-field.css`, the poster markup, and the mount snippet.

## Gotchas learned the hard way

- Large decorative images (a faint logo, film grain) become the LCP element as `background-image` AND as `mask-image` once their visible area beats the hero text block (a 360px mask on a phone dropped mobile to 97, LCP 2.4 s). Keep CSS-image artwork small, or draw large artwork as inline SVG, which is never an LCP candidate. Confirm with a `PerformanceObserver` for `largest-contentful-paint` in a 412px viewport.
- Never scale an LCP-candidate image during load-in: the growing painted area creates later LCP candidates. Load-in stagger uses `transform: translateY` only, never opacity, clip or scale on the hero text or portrait.
- Phones need layout work as much as motion: replace long single-column stacks with CSS scroll-snap rails (cards peek in; scale images with `animation-timeline: view(inline)`), 2x2 figure grids and compact rows. Fade only images on rails; dimming text with opacity fails `preview-check contrast`.
- Wrapped chip lists (a marquee's reduced-motion fallback) become a ten-row wall on phones; give reduced motion swipeable rows instead.
- Check contrast with `preview-check contrast`, not only axe/WCAGate: axe reports translucent and gradient backgrounds as `cantTell`, so white text on a pale gold button passed the gate. Never hard-code `color: #fff` on an accent background; use the site's dark foreground token.
- A single-column grid needs `minmax(0, 1fr)`.

- A `1fr` grid track is `minmax(auto, 1fr)`; a `white-space: nowrap` code block stretches it past the viewport on phones.
  Use `minmax(0, 1fr)` for every single-column grid.
- Do not read `getBoundingClientRect` or `scrollHeight` during load (forced reflow shows in Lighthouse); use
  `ResizeObserver` entries and CSS scroll timelines.
- `wrangler dev` serves a stale asset index after a rebuild; restart it before measuring.
- Cross-document View Transitions need no JavaScript: `@view-transition { navigation: auto }` inside a
  `prefers-reduced-motion: no-preference` media query, plus a persistent `view-transition-name` on the fixed nav.
