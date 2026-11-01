# Cache Purge

Astro-focused Cloudflare cache purge utility plus pre-deploy cache warm.

Dry-run is the default for both commands. Nothing is sent to Cloudflare until `--apply`.

## Commands

### Purge (default)

```bash
node ./Web_Toolkit/cache_purge/bin/cache-purge.mjs --site-profile ./site-profiles/example-workers.json
node ./Web_Toolkit/cache_purge/bin/cache-purge.mjs --site-profile ./site-profiles/example-workers.json --apply
```

Dry-run output lists every item and the number of requests it will take:

```text
cache-purge
- Profile: example-workers-site
- Environment: production
- Zone: example.com
- Mode: url
- Apply: no (dry-run)
- URL source: /path/to/project/dist/client
- files: 198 in 2 request(s) of up to 100
  - https://example.com/
  - https://example.com/about/
  - https://example.com/about
```

### Cache warm

GET-warm production and development hosts using `diagnostics.qualitySmoke.routes` (defaults to `/`).

```bash
node ./Web_Toolkit/cache_purge/bin/cache-purge.mjs warm --site-profile ./site-profiles/example-workers.json
node ./Web_Toolkit/cache_purge/bin/cache-purge.mjs warm --site-profile ./site-profiles/example-workers.json --apply
```

Dry-run lists URLs; `--apply` performs the fetches and exits non-zero on HTTP errors.

## Flags

| Flag | Purpose |
|------|---------|
| `--site-profile <path>` | Site profile JSON for the target site. |
| `--project-root <path>` | Override the profile project root. |
| `--environment production\|development` | Which profile hosts to purge. |
| `--mode url\|prefix\|hostname\|everything` | Purge strategy. `url` is safest and the default. |
| `--urls <csv>` | Explicit URL list (skips `dist/` sampling, variants, and `extraPaths`). |
| `--batch-size <n>` | Items per request (default 100, max 500). |
| `--include-assets` | Also purge content-hashed `/_astro/` files. |
| `--no-variants` | Skip the slashless twin of each directory URL. |
| `--apply` | Submit to Cloudflare. |

## Profile and environment keys

Set under `cloudflare.cachePurge` in the site profile (see `site-profile.schema.json`):

| Key | Purpose |
|-----|---------|
| `defaultMode`, `defaultEnvironment` | Defaults for `--mode` and `--environment`. |
| `distSubdir` | Folder under `dist/` that mirrors the public site. |
| `batchSize` | Items per request. |
| `extraPaths` | Paths not in `dist/` (SSR/API routes, for example `/api/content.json`) purged on every host. |

Environment: `CLOUDFLARE_API_TOKEN` (needs Zone > Cache Purge and Zone > Zone Read), `CF_CACHE_PURGE_MODE`, `CF_CACHE_PURGE_BATCH_SIZE`.

## Behavior

- **Where URLs come from:** the public site folder is `cloudflare.cachePurge.distSubdir`, else `cloudflare.headers.distSubdir`, else `dist/client` when `dist/server` also exists (Astro Cloudflare Workers adapter), else `dist/`.
- **What is skipped:** source maps, `_headers`, `_redirects`, `_routes.json`, `.assetsignore`, and `/_astro/*` (hashed filenames change with content, so stale copies are never served).
- **Variants:** directory URLs also get the slashless form (`/about/` and `/about`) because Cloudflare caches them as separate keys.
- **Hosts:** every host in the selected environment (apex and `www`) is purged.
- **Batching:** Cloudflare accepts up to 100 URLs or prefixes per request on Free, Pro, and Business (500 URLs on Enterprise), so larger sets are split automatically. Free accounts allow 5 purge requests per minute, so HTTP 429 is retried after `Retry-After`.
- **Failure handling:** a rejected batch stops the run, prints how many items were already purged, and exits `1`. Re-running is safe because purges are idempotent. An unresolved zone or an empty plan also exits `1`.
- **Prefix mode:** sends `host/path` with no scheme, query, or trailing slash. A root URL becomes the bare host, which purges the whole host, and the tool warns when that happens.
- **Not covered:** a `200` response only means Cloudflare accepted the purge. Confirm with `warm` and a `CF-Cache-Status` check.

Sources: [Purge cache limits](https://developers.cloudflare.com/cache/how-to/purge-cache/), [purge by prefix](https://developers.cloudflare.com/cache/how-to/purge-cache/purge_by_prefix/).

## Layout

```text
cache_purge/
  bin/cache-purge.mjs          # arg parsing, help, dispatch
  src/commands/purge.mjs       # plan + submit
  src/commands/warm.mjs        # GET warm
  src/lib/urls.mjs             # dist root, URL planning, batch size
  src/lib/cloudflare.mjs       # zone lookup, batched purge, 429 retry
```

Tests: `npm run test:cache` from the toolkit repo root (offline; `fetch` is injected).

Ops sequence: `HOW_TO.md` (cache purge + warm) and `OPERATIONS.md` step 15c.
