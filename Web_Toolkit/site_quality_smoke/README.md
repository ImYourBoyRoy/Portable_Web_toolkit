# Site Quality Smoke

SEO/performance/header smoke tests for live production and development hosts.

## Commands

- `site-quality-smoke run --site-profile <profile>`
- `site-quality-smoke diff --site-profile <profile>`

## What it checks

- title, meta description, canonical
- robots.txt — exact `Disallow: /` only (not `/admin`); production must not block all; development should
- sitemap candidates
- key response/security headers, redirects, asset cache / immutable samples
- root/route timing thresholds from the site profile
- Open Graph tags + live `og:image` fetch (default UA + Facebook crawler UA)
- **Legal / privacy** — real path `href`s only (ignore `#` and “legal team” marketing); live page probe
- **Cookies notice** — consent/banner UI when analytics detected; a lone Cookie Policy footer link does not count
- **On-page images** — prefer WebP/SVG (AVIF optional); warn on bare JPG/PNG/GIF without modern `<picture>`; warn on missing width/height
- **Fonts** — warn on remote font CDNs; prefer self-hosted
- optional `diagnostics.qualitySmoke.workerPreviewHost` for pre-cutover Worker validation
- localhost development hosts are skipped automatically
- Compliance is **HTML-only** — pair with browser-diagnostics for JS-injected banners
- JSON/Markdown snapshots you can compare with `site-quality-smoke diff`

## Profile knobs (`diagnostics.qualitySmoke`)

| Key | Purpose |
|-----|---------|
| `routes` | Paths to status-probe |
| `sitemapCandidates` | Sitemap URL candidates |
| `privacyPaths` | Extra/override legal-privacy paths to probe |
| `assetSampleSize` | How many `_astro` assets to sample |
| `maxRootDurationMs` / `maxRouteDurationMs` | Slow thresholds |
| `workerPreviewHost` | Pre-cutover Worker host |
| `skipDevelopment` | Force-skip development host |

## Notes

- Compliance checks parse **root HTML** (best-effort). Cookie banners injected only after JS may need `browser-diagnostics`.
- Social OG images may still be PNG/JPEG on purpose; that is separate from **on-page** media preference.