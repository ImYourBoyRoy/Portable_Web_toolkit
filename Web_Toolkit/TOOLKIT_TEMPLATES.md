# Web Toolkit: Reusable Template Guide

Starter files for Astro + Cloudflare client sites live at the **repository root** in `site-starter/`. Discovery generators live in **`templates/discovery/`** inside this folder.

## New client sites

| Template | Path |
|----------|------|
| Workers package | [`../site-starter/workers.package.json`](../site-starter/workers.package.json) |
| Pages package | [`../site-starter/pages.package.json`](../site-starter/pages.package.json) |
| Wrangler (Workers) | [`../site-starter/workers.wrangler.toml`](../site-starter/workers.wrangler.toml) |
| Wrangler (Pages) | [`../site-starter/pages.wrangler.toml`](../site-starter/pages.wrangler.toml) |
| Astro config examples | [`../site-starter/astro.config.workers.example.mjs`](../site-starter/astro.config.workers.example.mjs), [`astro.config.pages.example.mjs`](../site-starter/astro.config.pages.example.mjs) |
| Structural CSS | [`../site-starter/src/styles/`](../site-starter/src/styles/) |
| Env scaffold | [`../site-starter/.env.example`](../site-starter/.env.example) |

Walkthrough: [`../site-starter/README.md`](../site-starter/README.md)

## Installable templates (one command)

Every folder under `Web_Toolkit/templates/` that has a `template.json` installs with **`site-templates`**: files go to the right
destinations, prerequisites install first, CSS imports are added in valid order, and the next steps are printed. Dry-run unless `--apply`;
a file that differs is never overwritten without `--force`.

```bash
node ./Web_Toolkit/site_templates/bin/site-templates.mjs list
node ./Web_Toolkit/site_templates/bin/site-templates.mjs add layout analytics contact styles fonts --project-root . --apply
node ./Web_Toolkit/site_templates/bin/site-templates.mjs show layout --section props   # one template's contract, ~150 tokens
node ./Web_Toolkit/site_theme/bin/site-theme.mjs apply paper ink --pair paper,ink --project-root .   # the themes themselves
```

| Template | What it is |
|---|---|
| `base` | tsconfig (Astro strict, Workers-safe types), `src/env.d.ts`, `pnpm-workspace.yaml` |
| `theme` | token contract + ThemeInit/Toggle/Picker (themes via `site-theme`) |
| `discovery` | sitemap, robots + AI policy, llms.txt, JSON-LD, markdown twins, Workers middleware |
| `layout` | BaseHead (SEO/OG/canonical), BaseLayout, header + mobile menu, footer, breadcrumbs, skip link |
| `styles` | component CSS on the tokens: button, card, hero, section, form controls, prose |
| `fonts` | self-hosted fonts: `sync-fonts` with measured fallback metrics, FontPreload |
| `analytics` | consent banner (default off) + GA4 / PostHog / Cloudflare Web Analytics loaders after consent |
| `contact` | accessible form with honest 503/502 status, honeypot + time trap + rate limit + body cap, optional Turnstile (`mode: off`), local draft, retry + email fallback, no-JS POST, Workers `send_email` endpoint. Verify with `form-doctor` |
| `contact-intake` | optional, on top of `contact`: multi-section intake handler with a strict field allowlist (long forms only) |

Verified end to end: a site assembled only with these commands passed `astro check` (0 errors), built, and passed the WCAGate gate
(3 routes x light/dark x mobile/desktop, all probes), `preview-check seo` and `stylesheet-check`, and showed no low-contrast text under any of
the five themes.

## Discovery (Zenith layer)

[`./templates/discovery/`](./templates/discovery/) — robots, sitemap, llms, llms-full, humans, security.txt, content/search APIs, JSON-LD, middleware. Customize `site-config.ts` per client and declare required public REST/MCP endpoints in `diagnostics.discovery`; no baked-in client domains.

## Branding

Use **[Brand Doctor](./brand_doctor/README.md)** with each client's `BRAND_GUIDE.md` and site profile.
