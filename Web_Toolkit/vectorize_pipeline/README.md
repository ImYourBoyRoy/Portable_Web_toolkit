# vectorize-pipeline

Clean SVG wordmarks and logos — two paths:

1. **`from-font`** (preferred for type) — outline TTF/OTF with [opentype.js](https://opentype.js.org/)
2. **`vectorize`** — prep + [VTracer](https://github.com/visioncortex/vtracer) for high-contrast rasters

## When to use which

| Source | Use |
|--------|-----|
| You have (or can pick) the brand fonts | **`from-font`** — crisp curves, small SVG |
| High-res flat icon / logo, clean edges | **`vectorize --preset logo`** |
| Low-res / aliased PNG (stair-steps at 200% zoom) | **`from-font`**, or `vectorize --preset logo_smooth` as a last resort |

Auto-trace cannot invent smooth curves that were never in a ~250px-tall aliased export.

## Requirements

- Node 26+ (toolkit baseline)
- **from-font:** `cd Web_Toolkit/vectorize_pipeline && npm install` (opentype.js)
- **vectorize:** [VTracer](https://github.com/visioncortex/vtracer) (`cargo install vtracer` or `VTRACER_PATH`) + Python 3 + Pillow + NumPy

## from-font

```bash
node ./Web_Toolkit/vectorize_pipeline/bin/vectorize-pipeline.mjs from-font \
  --title "Example Studio" \
  --subtitle WORKS \
  --serif ./Reference_Files/Branding/fonts/PlayfairDisplay-SemiBold.ttf \
  --sans ./Reference_Files/Branding/fonts/Montserrat-SemiBold.ttf \
  --fill '#f4fffe' \
  --output ./public/brand/brand-title.svg \
  --apply
```

## vectorize

```bash
node ./Web_Toolkit/vectorize_pipeline/bin/vectorize-pipeline.mjs vectorize \
  --input ./public/brand/icon.png \
  --preset logo_smooth \
  --fill '#f4fffe' \
  --apply
```

### Presets

| Preset | Best for |
|--------|----------|
| `logo` (default) | Clean high-contrast masters |
| `logo_smooth` | Aliased/low-res — 4× upscale + blur, smoother splines |
| `logo_polygon` | Smaller files, sharper corners |
| `poster` / `photo` | Flat multi-color / photos |

## Notes

- `currentColor` only works for **inline** SVG — not `<img src="*.svg">`. Use `--fill` for hero images.
- Exit `0` on success; `1` on missing tools / bad input.
