# Web Toolkit: Reusable Template Guide

This document identifies the battle-tested "Golden Configuration" templates for Cloudflare Pages, Astro static builds, and high-fidelity branding.

## 🚀 Infrastructure Templates

### 1. [astro.config.mjs](./astro.config.mjs)

- **Why**: Contains the critical `imageService: 'passthrough'` and `output: 'static'` configuration.
- **Value**: Prevents the common "Broken Image" bug on Cloudflare by ensuring assets are statically optimized or passed through cleanly without requiring a dynamic image worker.

### 2. [package.json](./package.json)

- **Why**: Contains the `optimize:loop` sequence.
- **Value**: Standardizes the "Build -> Deploy -> Purge -> Audit" cycle into a single command.

### 3. [wrangler.toml](./wrangler.toml)

- **Why**: Explicitly maps the `./dist/client` directory for Pages.
- **Value**: Eliminates ambiguity during deployment.

### 4. [.env.example](./.env.example)

- **Why**: Lists all necessary API tokens.
- **Value**: Essential for onboarding new projects or troubleshooting environment issues.

## 🎨 Layout & Branding Templates

### 1. [Discovery generators](./templates/discovery/)

- **Why**: Generic, copy-ready `robots.txt`, `sitemap.xml`, `llms.txt`, and `llms-full.txt` starters.
- **Value**: No client domains or project branding baked in. Extend inside each site repo with collections, CMS data, or database queries.

### 2. [og.spec.json](./og.spec.json)

- **Why**: The declarative manifest for the `brand_doctor`.
- **Value**: Shows how to map site fonts and colors into automated asset generation.

### 3. [Layout.astro](./src/layouts/Layout.astro) (Theme Shell)

- **Why**: A high-fidelity "Head & SEO" theme template.
- **Value**: Includes pre-configured preconnects, OpenGraph logic, Twitter cards, and the dynamic canonical URL system. It serves as the master structural shell for the entire site.

---
*Reference these files when bootstrapping new projects to ensure consistency and performance.*
