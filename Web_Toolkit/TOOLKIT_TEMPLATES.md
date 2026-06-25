# Web Toolkit: Reusable Template Guide

Battle-tested templates for Astro + Cloudflare client sites live in the **repository root**, not inside `Web_Toolkit/`.

## New client sites — start here

| Template | Path | Use |
|----------|------|-----|
| Workers (SSR) | [`../../site-starter/workers.package.json`](../../site-starter/workers.package.json) | `output: 'server'` + `@astrojs/cloudflare` |
| Pages (static) | [`../../site-starter/pages.package.json`](../../site-starter/pages.package.json) | `output: 'static'` |
| Wrangler (Workers) | [`../../site-starter/workers.wrangler.toml`](../../site-starter/workers.wrangler.toml) | Worker deploy |
| Wrangler (Pages) | [`../../site-starter/pages.wrangler.toml`](../../site-starter/pages.wrangler.toml) | Pages deploy |
| Env scaffold | [`../../site-starter/.env.example`](../../site-starter/.env.example) | Client secrets template |
| Helper scripts | [`../../site-starter/scripts/`](../../site-starter/scripts/) | readiness, headers, cache clean |

Full walkthrough: [`../../site-starter/README.md`](../../site-starter/README.md)

## Discovery generators

Generic, copy-ready starters (no client domains baked in):

- [`./templates/discovery/`](./templates/discovery/) — `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`

Extend inside each site repo with your route manifest or content collections.

## Astro package templates (reference)

- [`../../templates/package.astro-workers.json`](../../templates/package.astro-workers.json)
- [`../../templates/package.astro-static.json`](../../templates/package.astro-static.json)

## Branding

Use **[Brand Doctor](./brand_doctor/README.md)** with each client's `BRAND_GUIDE.md` and site profile — do not copy OG/layout files from another project.

---

*Reference these paths when bootstrapping new projects for consistency and performance.*
