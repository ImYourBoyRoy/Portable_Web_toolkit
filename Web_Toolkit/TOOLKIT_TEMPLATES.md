# Web Toolkit: Reusable Template Guide

Starter files for Astro + Cloudflare client sites live at the **repository root** in `site-starter/`. Discovery generators live in **`templates/discovery/`** inside this folder.

## New client sites

| Template | Path |
|----------|------|
| Workers package | [`../../site-starter/workers.package.json`](../../site-starter/workers.package.json) |
| Pages package | [`../../site-starter/pages.package.json`](../../site-starter/pages.package.json) |
| Wrangler (Workers) | [`../../site-starter/workers.wrangler.toml`](../../site-starter/workers.wrangler.toml) |
| Wrangler (Pages) | [`../../site-starter/pages.wrangler.toml`](../../site-starter/pages.wrangler.toml) |
| Astro config examples | [`../../site-starter/astro.config.workers.example.mjs`](../../site-starter/astro.config.workers.example.mjs), [`astro.config.pages.example.mjs`](../../site-starter/astro.config.pages.example.mjs) |
| Structural CSS | [`../../site-starter/src/styles/`](../../site-starter/src/styles/) |
| Env scaffold | [`../../site-starter/.env.example`](../../site-starter/.env.example) |

Walkthrough: [`../../site-starter/README.md`](../../site-starter/README.md)

## Discovery (Zenith layer)

[`./templates/discovery/`](./templates/discovery/) — robots, sitemap, llms, llms-full, humans, security.txt, content/search APIs, JSON-LD, middleware. Customize `site-config.ts` per client; no baked-in client domains.

## Branding

Use **[Brand Doctor](./brand_doctor/README.md)** with each client's `BRAND_GUIDE.md` and site profile.
