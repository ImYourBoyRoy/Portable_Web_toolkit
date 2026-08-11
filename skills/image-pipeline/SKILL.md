---
name: image-pipeline
description: Run Portable Web Toolkit image-pipeline to convert eligible rasters to WebP and enforce media format discipline on toolkit-managed sites. Use when optimizing photographic or raster assets.
---

# Image Pipeline

```bash
node ./Web_Toolkit/image_pipeline/bin/image-pipeline.mjs --help
```

## Rules

1. **Default:** Astro `Image` / `Picture` from `astro:assets` for content photos (masters in `src/assets/`). Prefer `OptimizedPicture.astro` with `formats={['avif','webp']}`. Workers: `cloudflare({ imageService: 'compile' })`.
2. **Gap-fill only:** run this CLI on **`public/`** JPG/PNG leftovers that bypass Astro (not imported assets).
3. Prefer WebP (default optimize); optional `--format avif|both` when Pillow supports AVIF.
4. Do not overwrite source masters without approval.
5. Record asset conventions in client `MEMORY.md` when introduced.

```bash
node ./Web_Toolkit/image_pipeline/bin/image-pipeline.mjs audit --project-root .
node ./Web_Toolkit/image_pipeline/bin/image-pipeline.mjs optimize --project-root . --apply --replace-references
```


