# Sourcing Doctor

High-fidelity content extraction from legacy CMS sites for rebuilds. Writes a structured `ContentManifest.json`, URL map, and optional local media so the rebuild does not depend on a live admin session.

Supported sources:

- **WordPress** — public REST API (`/wp-json/wp/v2`)
- **Wix Stores** — public storefront HTML + product JSON-LD (no admin, no API keys, no Headless OAuth)

Squarespace is reserved in the site-profile schema and not implemented yet.

## Quick Start

```bash
# From a linked client project:
node ./Web_Toolkit/sourcing_doctor/bin/sourcing-doctor.mjs audit \
  --site-profile ./<siteId>.site-profile.json

node ./Web_Toolkit/sourcing_doctor/bin/sourcing-doctor.mjs extract \
  --site-profile ./<siteId>.site-profile.json
```

`--project-root` is optional when the profile already has `projectRoot`.

## Site profile

```json
{
  "sourcing": {
    "type": "wix",
    "url": "https://www.example.com",
    "includeMedia": true,
    "delayMs": 900,
    "shopPaths": ["/", "/shop"],
    "productPathPrefix": "/product-page/",
    "rebuildProductPath": "/product/",
    "writeCatalog": "src/data/catalog.json",
    "phone": "",
    "pages": [
      { "path": "/faq", "slug": "faq", "title": "FAQ" },
      { "path": "/contact", "slug": "contact", "title": "Contact" }
    ],
    "categoryRules": [
      { "category": "Motors", "pattern": "\\bmotor\\b" }
    ],
    "defaultCategory": "Hardware"
  }
}
```

Omit `pages` to try `/faq` and `/contact` and skip whichever 404. Omit `categoryRules` to classify products as `Uncategorized` (or `defaultCategory`). Put client taxonomy in the **site profile**, not in this tool.

## Command Reference

### `extract`

Retrieves content and optionally downloads media.

- **WordPress:** pages, posts, media library.
- **Wix:** paginated shop listing, each product-page JSON-LD Product, optional static pages.

### `audit`

Checks whether the configured source is reachable (WP REST or public Wix storefront with product links).

## Manifest Outputs

- **`ContentManifest.json`**: text content, metadata, and provenance.
- **`src/data/catalog.json`** (Wix, overridable via `writeCatalog`): storefront-ready product snapshot.
- **`legacy_sourcing/`**: copies of manifests for the rebuild archive.
- **`ImageManifest.csv`**: source URL → local path.
- **`URLMap.csv`**: original URLs → rebuild paths.

## Wix notes

Wix Catalog V3 / Headless SDK requires an OAuth app the site owner creates. This extractor uses only **public pages**. Rate-limit with `delayMs` (default 900) so Wix does not reset the connection.

Media URLs from `static.wixstatic.com` are stripped back to the original file (no `v1/fill` upscales).

## Development

Native Node.js ESM. Requires **Node.js 26+** (repo baseline).

```bash
node --test ./Web_Toolkit/sourcing_doctor/tests/wix.test.mjs
```
