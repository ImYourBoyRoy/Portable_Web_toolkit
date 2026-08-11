# Discovery Doctor

Audit Zenith discovery posture for a built `dist/` tree or a live site URL.

**Fail-closed:** any failing check exits **2**. Warnings alone exit **0** unless `--strict`.

## Usage

```bash
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist/client
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs https://example.com
node ./Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist --strict
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | No failures (warnings allowed unless `--strict`) |
| 1 | Usage / missing target |
| 2 | One or more check failures |

## Checks

| Artifact | Rule |
|----------|------|
| Sitemap | `/sitemap.xml` **or** `/sitemap-index.xml` present; body must contain `<urlset` or `<sitemapindex` |
| robots.txt | Present; warn if no `Sitemap:` directive |
| llms.txt / llms-full.txt | Present |
| humans.txt | Present |
| `/.well-known/security.txt` | Present |
| `/api/content.json` | Present + valid JSON |
| `/api/search.json` | Live: fetch; static dist: INFO (SSR OK) |
| `_headers` | Full Zenith baseline under `dist/` or `dist/client/` |
| JSON-LD | `application/ld+json` with `WebSite`, `Organization`, or `Person` |
| BreadcrumbList | Warn-only when missing on homepage |

## Cross-platform

Uses `node:path` and `path.resolve`. No hardcoded path separators in operator output.

## Tests

```bash
npm test --prefix ./Web_Toolkit/discovery_doctor
```
