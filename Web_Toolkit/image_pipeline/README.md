# Image Pipeline

Audits raster assets and converts eligible JPG/PNG files to **lossless WebP**.

## Purpose

- reduce image weight without changing pixels
- keep Open Graph and icon/favicon assets out of the automatic WebP conversion path
- give the model exact dimensions and format details before it changes branding/media

## Commands

```bash
node ./bin/image-pipeline.mjs audit --project-root /path/to/project
node ./bin/image-pipeline.mjs optimize --project-root /path/to/project --apply --replace-references
```

## Defaults

Excluded from automatic WebP conversion:

- Open Graph images
- favicon assets
- apple-touch icons
- manifest icons
- files under `public/assets/icons/`
