---
name: vectorize-pipeline
description: Rebuild wordmarks from licensed font outlines or convert suitable high-contrast raster artwork into clean SVG candidates with the Portable Web Toolkit vectorization pipeline. Use for low-resolution logo recovery, trace preparation, SVG cleanup, or deciding when automatic tracing is inappropriate. Do not replace an approved vector master or imply that traced artwork is authoritative.
---

# Vectorize Pipeline

## Preflight

Read the client repository's applicable instructions and Brand Guide, preserve
unrelated work, and confirm the input and output paths are inside the intended
project. Establish ownership, licensing, modification rights, and the status of
any approved vector master before processing.

## Prefer `from-font` for type

If a logo PNG looks stair-stepped at 200% zoom, **do not auto-trace it** — rebuild from fonts:

```bash
node ./Web_Toolkit/vectorize_pipeline/bin/vectorize-pipeline.mjs from-font \
  --title "Example Studio" \
  --subtitle WORKS \
  --serif ./brand/fonts/ExampleSerif.ttf \
  --sans ./brand/fonts/ExampleSans.ttf \
  --fill '#f4fffe' \
  --output ./public/brand/example-wordmark.svg \
  --apply
```

First time: `cd Web_Toolkit/vectorize_pipeline && npm install`

Inspect package scripts before installing. Use the repository-approved
environment and do not install VTracer, Python packages, or fonts globally
without authorization.

## Raster path (`vectorize`)

```bash
node ./Web_Toolkit/vectorize_pipeline/bin/vectorize-pipeline.mjs vectorize \
  --input ./logo.png --preset logo_smooth --fill '#f4fffe' --apply
```

| Preset | Use |
|--------|-----|
| `logo` | Clean high-contrast masters |
| `logo_smooth` | Low-res/aliased — upscale+blur then VTracer |
| `logo_polygon` | Smaller / sharper corners |

## Flags

| Flag | Effect |
|------|--------|
| `--apply` | Write output |
| `--fill '#hex'` | For `<img src>` SVGs |
| `--current-color` | Inline SVG only |
| `--scale` / `--blur` | Prep overrides (vectorize) |

## Never

- Expect auto-trace to beat a hand SVG or font outlines on a soft/aliased master
- Use `--current-color` with `<img src="*.svg">`
- Trace artwork without confirming ownership, licensing, and allowed modification
- Discard the original raster, font, or approved master

## Verify

Inspect the SVG at multiple scales, validate its XML, compare its silhouette and
spacing to the authorized source, and check fill behavior in its real embedding
mode. Treat output as a review candidate until brand approval is established.
