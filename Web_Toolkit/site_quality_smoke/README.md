# Site Quality Smoke

SEO/performance/header smoke tests for live production and development hosts.

## Commands

- `site-quality-smoke run --site-profile <profile>`
- `site-quality-smoke diff --site-profile <profile>`

## What it checks

- title
- meta description
- canonical
- robots.txt
- sitemap
- key response/security headers
- basic redirect behavior
- sampled asset headers
- whether sampled versioned static assets look long-cached/immutable
- root/route timing thresholds from the site profile
- Open Graph tags (`og:title`, `og:description`, `og:url`, `og:image`)
- live `og:image` fetchability (default UA + Facebook `facebookexternalhit` crawler UA)
- Facebook-oriented warnings (WebP/SVG OG assets, missing dimensions/type hints)
- optional `diagnostics.qualitySmoke.workerPreviewHost` for pre-cutover Worker validation
- localhost development hosts are skipped automatically
- JSON/Markdown snapshots you can compare with `site-quality-smoke diff`
