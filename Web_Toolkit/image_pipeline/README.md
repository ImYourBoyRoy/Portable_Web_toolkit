# Image Pipeline

**Policy:** Astro `Image` / `Picture` (`astro:assets`) is the default for content photos. This CLI **fills gaps** — rasters under `public/` that never go through Astro.

## Purpose

1. **Audit Astro image posture** (config `imageService`, `OptimizedPicture`, bare `<img>` JPG/PNG, `public/` leftovers)
2. Convert eligible `public/` JPG/PNG → **WebP** (default) or optional **AVIF**
3. Keep Open Graph / favicon / icon assets out of automatic conversion

## Commands

```bash
node ./bin/image-pipeline.mjs audit --project-root /path/to/project
node ./bin/image-pipeline.mjs optimize --project-root /path/to/project --apply --replace-references
node ./bin/image-pipeline.mjs optimize --project-root /path/to/project --apply --format both
```

| Flag | Meaning |
|------|---------|
| `--apply` | Write files (dry-run otherwise) |
| `--replace-references` | Rewrite source refs to `.webp` siblings only |
| `--format webp\|avif\|both` | Default `webp` |

## Default path (do this first)

1. Put masters in `src/assets/`
2. Use `src/components/OptimizedPicture.astro` (`formats={['avif','webp']}`)
3. Workers: `adapter: cloudflare({ imageService: 'compile' })`
4. Only then run image-pipeline for remaining `public/` dumps

## Requirements

- Python + Pillow (WebP)
- For AVIF: Pillow+libavif or `pillow-avif-plugin`
