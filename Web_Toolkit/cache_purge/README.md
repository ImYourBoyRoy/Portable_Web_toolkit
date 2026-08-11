# Cache Purge

Astro-focused Cloudflare cache purge utility plus pre-deploy cache warm.

## Commands

### Purge (default)

```bash
node ./Web_Toolkit/cache_purge/bin/cache-purge.mjs --site-profile ./site-profiles/example-workers.json
node ./Web_Toolkit/cache_purge/bin/cache-purge.mjs --site-profile ./site-profiles/example-workers.json --apply
```

### Cache warm

GET-warm production and development hosts using `diagnostics.qualitySmoke.routes` (defaults to `/`).

```bash
node ./Web_Toolkit/cache_purge/bin/cache-purge.mjs warm --site-profile ./site-profiles/example-workers.json
node ./Web_Toolkit/cache_purge/bin/cache-purge.mjs warm --site-profile ./site-profiles/example-workers.json --apply
```

Dry-run lists URLs; `--apply` performs the fetches and exits non-zero on HTTP errors.

## Defaults

- Dry-run first for both purge and warm
- URL/single-file purge preferred
- Can derive purge URLs from `dist/` contents and site profile hosts
- Ops sequence: `HOW_TO.md` (cache purge + warm) and `OPERATIONS.md` step 15c
