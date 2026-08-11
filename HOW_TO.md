# How to use Portable Web Toolkit (human → agent prompts)

This guide is for **you** (site owner / operator). Paste the prompts into your
coding agent (Cursor, Claude, Codex, etc.). The agent should prefer toolkit
CLIs over inventing scripts.

**Agents:** also read [`START_HERE.md`](./START_HERE.md) and
[`Web_Toolkit/OPERATIONS.md`](./Web_Toolkit/OPERATIONS.md).

---

## Before you ask for anything

Have these ready in the **client site** folder (not inside this toolkit repo).

| Need | `.env` / path | Who | Where to get it |
|------|---------------|-----|-----------------|
| Linked toolkit | `Web_Toolkit/` symlink | Agent | `node ./scripts/link-web-toolkit.mjs` (from toolkit) |
| Site profile | `*.site-profile.json` in site root | Agent + you | `init-site-profile` after intake |
| Cloudflare API token | `CLOUDFLARE_API_TOKEN` | **User Provided** | [dash.cloudflare.com → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) · docs: [Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) |
| PageSpeed API key | `GOOGLE_PAGESPEED_API_KEY` | **User Provided** | [PageSpeed Insights API — Get a Key](https://developers.google.com/speed/docs/insights/v5/get-started) · enable API in [Google Cloud Console](https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com) → [Credentials](https://console.cloud.google.com/apis/credentials) |
| Zone / names / URLs | `.env` section B + profile | Agent proposes; you confirm | From your domain + Cloudflare dashboard ([Overview](https://dash.cloudflare.com/)) |
| PostHog (recommended) | `PUBLIC_POSTHOG_API_KEY` (+ host) | **User Provided** (if agreed) | [PostHog → Project settings → Project API key](https://app.posthog.com/settings/project) · [us.i.posthog.com](https://us.i.posthog.com) / [eu.i.posthog.com](https://eu.i.posthog.com) |
| GA4 (recommended) | `PUBLIC_GA4_MEASUREMENT_ID` | **User Provided** (if agreed) | [Google Analytics Admin → Data streams → Measurement ID](https://analytics.google.com/) (`G-…`) |
| Brand rules | `BRAND_GUIDE.md` | You + agent | Written in the client project |
| Turnstile (forms) | `PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | **User Provided** (optional) | [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) |
| Resend (email) | `RESEND_API_KEY` | **User Provided** (optional) | [resend.com/api-keys](https://resend.com/api-keys) |
| Porkbun (optional registrar) | `PORKBUN_API_KEY` / `PORKBUN_SECRET_KEY` | **User Provided** (optional) | [porkbun.com/account/api](https://porkbun.com/account/api) |

Env template: [`site-starter/.env.example`](./site-starter/.env.example) (sections A–D).

---

## Healthy order of operations

Use this sequence unless you have a good reason to skip a step.

```text
1. Ready the machine (once)     Setup_Agent_Environment / host bootstrap
2. Ready the site session       site-readiness run
3. Fix safe gaps                project-init apply-safe / missing profile / .env A–B
4. Local truth                  npm install → check → build → discovery-doctor on dist
5. Staging first                deploy staging → smoke → fix
6. Production only when OK      dry-run CF changes → deploy prod → smoke
7. Edge hygiene                 purge remote cache (targeted) → warm key URLs
8. Measure                      PageSpeed / quality smoke / WCAG evidence as needed
9. Media / legal / fonts        image format + local fonts + privacy/cookies checks
10. Improve safely              smallest fixes → rebuild → re-measure (no thrash)
```

**Rules the agent must follow**

- Dry-run Cloudflare mutations before `--apply`.
- Prefer staging before production.
- Never commit secrets.
- Do not “fix everything” blindly — show a plan, then apply.
- PageSpeed **100/100/100/100** is a *target*, not a promise. Chase Core Web Vitals
  and real regressions without breaking design, SEO, forms, or accessibility.
  Use bundled `wcag_auditor` for a11y evidence — not the PSI Accessibility score alone.
- **Images:** prefer **Astro `Image` / `Picture`** (`astro:assets`, masters in `src/assets/`) with
  `OptimizedPicture` (`formats={['avif','webp']}`). Workers use `cloudflare({ imageService: 'compile' })`.
  Use **image-pipeline** only for leftover JPG/PNG under `public/` (WebP default; optional AVIF).
  Flag broken, stretched, missing-dimension, or poorly rendered images.
- **Fonts:** self-host locally under the project (no hotlinked Google Fonts / CDN
  font CSS as the primary path). Subset when practical.
- **Legal + cookies:** production sites need a reachable legal/privacy page with a
  real `href` (not `#` / “legal team” marketing copy). If analytics or non-essential
  tracking is on, a cookies **notice/consent UI** must exist — a lone “Cookie Policy”
  footer link is not enough. `site-quality-smoke` is HTML-only; use
  **browser-diagnostics** for JS-injected banners. Brand Guide: keep `BRAND_GUIDE.md`
  in the client project; **brand-doctor audit** reads it and soft-applies guide hex
  colors when generating OG if profile branding is incomplete.

---

## Copy-paste prompts (common requests)

Replace `<site>` with your client project path. Keep the site open as the workspace when possible.

### 1) First-time / new machine / new site

```text
Use Portable Web Toolkit. Read README.md and docs/agent-skills/ONBOARDING_STAGES.md
(skill: site-onboarding). Walk stages S0–S9 with a checkpoint after each stage.
Ask before host installs, Cloudflare token work, Cloudflare MCP install, scaffold,
and production deploy.
```

### 2) Session start (existing site)

```text
Using Portable Web Toolkit on this site: run site-readiness, summarize the JSON,
and propose the next safe steps only. Do not deploy or apply Cloudflare changes yet.
```

### 3) Cloudflare audit (read-only)

```text
Using Portable Web Toolkit Cloudflare tools (cf-agent), audit this site:
permissions, site, DNS, rules, and performance posture. Dry-run / audit only —
no --apply. Report findings and recommended repairs.
```

### 4) Cloudflare audit + repair

```text
Using Portable Web Toolkit Cloudflare tools, audit then repair this site’s
Cloudflare posture. Show the dry-run plan first and wait for my approval before
any --apply. Preserve email/MX. Prefer smallest safe changes. Re-audit after.
```

### 5) PageSpeed Insights

```text
Use the pagespeed-diagnostics Portable Web Toolkit skill. Run PageSpeed Insights
on this site (mobile + desktop) with GOOGLE_PAGESPEED_API_KEY from the project .env.
Summarize scores, Core Web Vitals, and the top fixes. Do not change production until
I approve a fix plan.
```

### 6) Discovery / SEO / AI artifacts

```text
Using Portable Web Toolkit, run discovery-doctor on the local build output
(Workers: ./dist/client, Pages: ./dist). Fix failures, rebuild if needed, then
optionally re-check the live production URL after I approve deploy.
```

### 7) Accessibility evidence

```text
Use the wcag-auditor Portable Web Toolkit skill (Web_Toolkit/wcag_auditor only —
never AI/wcag-auditor). Ensure Playwright Chromium is ready in this client project,
then run against the site profile and https://… or local preview. After the run,
open and share wcag-audit-dashboard.html with me (it lists file:line when mapped).
Summarize blocking findings and safe fixes. Do not treat PageSpeed Accessibility as
WCAG proof.
```

### 8) Images, fonts, legal page, cookies

```text
Using Portable Web Toolkit on this site, run a media + compliance pass:

1) Images — prefer Astro Image/Picture for content photos (`src/assets/` + OptimizedPicture).
   Find broken/poorly rendered images. Use image-pipeline only for leftover `public/` JPG/PNG
   (WebP default; optional `--format avif|both`). Keep OG/social as PNG/JPEG when crawlers require it.
2) Fonts — ensure fonts are stored and served locally from the project (no primary
   dependency on Google Fonts or other font CDNs). Fix any remote @import font CSS.
3) Legal — confirm a legal/privacy page exists, is linked with a real path href from
   the footer (or equivalent), and is reachable on production (and in discovery/sitemap when indexable).
4) Cookies — if PostHog, GA4, or other non-essential tracking is enabled, confirm a
   cookies notification / consent UI exists (not only a Cookie Policy link). Match
   Brand Guide / jurisdiction when a guide exists; smoke is HTML-only — use
   browser-diagnostics for JS banners.

Use image-pipeline, brand-doctor, **site-quality-smoke** (legal/cookies/images/fonts),
browser-diagnostics, and discovery-doctor as needed. Report gaps and a smallest-safe
fix plan; apply only with my approval.
```

### 9) Local cache clean

```text
Using Portable Web Toolkit, purge local build caches for this site
(npm run clean:cache / toolkit clean-local-cache) without deleting source or .env.
```

### 10) Remote (Cloudflare) cache purge + warm

```text
Using Portable Web Toolkit, dry-run a targeted Cloudflare cache purge for this
site profile, then apply after I approve. After purge, warm the remote cache with
`cache-purge warm --site-profile <path>` (dry-run lists URLs from hosts +
qualitySmoke.routes; `--apply` GETs). Summarize what was purged and warmed.
```

### 11) Package / toolchain refresh (no deploy)

```text
Using Portable Web Toolkit: update my local agent environment if needed, then run
package-updater on this site’s package.json (includes `npx @astrojs/upgrade` for
Astro). Respect TypeScript ^6.x until
@astrojs/check supports 7. Show the diff, apply only with approval, npm install,
then npm run check and build. Do not deploy yet.
```

---

## Full maintenance loop (recommended prompt)

This matches a healthy “upgrade → verify → ship → measure → fix” day.

```text
Use the site-maintenance Portable Web Toolkit skill on this client site. Follow
HOW_TO.md full maintenance loop with checkpoints. Stop and ask before any production
deploy or Cloudflare --apply.

Order (do not skip ahead):
1) Update local agent environment if outdated (ask before privileged installs).
2) Run package-updater on package.json (Astro → `@astrojs/upgrade`, then pins;
   TS stays on ^6.x); show diff; apply with
   approval; npm install.
3) Purge local caches; npm run check; npm run build.
4) discovery-doctor on the correct dist path; fix blockers.
5) Media/fonts/legal/cookies pass (HOW_TO §8): WebP/AVIF/SVG preference, local fonts,
   legal page, cookies notice when analytics are on.
6) Healthy local/site smoke (site-quality-smoke / preview smoke as appropriate).
7) Deploy to staging first if configured; smoke staging.
8) After my explicit OK: deploy production (headers-deploy write-deploy as required).
9) Targeted remote cache purge (dry-run → apply); then warm key production URLs.
10) Run PageSpeed Insights (mobile + desktop) via pagespeed-diagnostics.
11) Propose a minimal fix plan toward strong CWV / high PSI categories without
    breaking layout, brand, forms, SEO, or accessibility. Apply fixes only with
    approval; rebuild; re-smoke; re-measure.

Prefer toolkit CLIs. Never commit secrets. Dry-run CF mutations. Record outcomes
in the site MEMORY.md.
```

### Shorter variant (when you already trust the site)

```text
Toolkit maintenance on this site: refresh packages (safe pins), local cache purge,
check/build, media/fonts/legal/cookies pass, smoke, deploy prod only after my OK,
remote cache purge + warm, PageSpeed both strategies, then fix high-impact CWV
issues without breaking anything. Checkpoints before apply/deploy.
```

---

## Toolkit modules (what each does)

All operator modules live under `Web_Toolkit/`. Pass `--site-profile` for the
target client site. Secrets stay in the **client** `.env`.

### Setup & project

| Module | Binary (typical) | What it does |
|--------|------------------|--------------|
| **Setup Agent Environment** | `Setup_agent_environment/bin/…` | Bootstraps the workstation (Node, tools, OS-native deps) for agent + Cloudflare work. |
| **Setup Astro Environment** | `Setup_astro_environment/bin/…` | Non-destructive Astro/project hole-finding and preview readiness. |
| **Project Init** | `project_init/bin/project-init.mjs` | Applies safe starter gaps (skills link, profile hooks, missing scaffolding). |
| **Init Site Profile** | `init_site_profile/bin/init-site-profile.mjs` | Creates client `<siteId>.site-profile.json` from intake (not into toolkit `site-profiles/`). |
| **Package Updater** | `package_updater/bin/package-updater.mjs` | Runs `@astrojs/upgrade` on Astro sites + reviews/bumps other pins (show diff → approve). |

### Readiness & discovery

| Module | Binary (typical) | What it does |
|--------|------------------|--------------|
| **Site Readiness** | `site_readiness/bin/site-readiness.mjs` | Phased “what’s missing / next step” report before material work. |
| **Discovery Doctor** | `discovery_doctor/bin/discovery-doctor.mjs` | Audits robots, sitemap, llms, humans, security.txt, content/search APIs, JSON-LD. **Fail-closed** (exit `2` on FAIL). |
| **Sourcing Doctor** | `sourcing_doctor/bin/sourcing-doctor.mjs` | Extracts high-fidelity content from legacy CMS (e.g. WordPress) into structured JSON. |
| **Integration Doctor** | `integration_doctor/bin/integration-doctor.mjs` | Validates `.env` posture and live integrations (CF token, analytics, forms, email). |
| **Toolkit Report** | `toolkit_report/bin/toolkit-report.mjs` | Quick readiness snapshot for project + toolkit. |

### Brand, media & CSS

| Module | Binary (typical) | What it does |
|--------|------------------|--------------|
| **Brand Doctor** | `brand_doctor/bin/brand-doctor.mjs` | Audit + OG/icons; reads `BRAND_GUIDE.md`; `sync-tokens` → `tokens.css` / profile branding. |
| **Image Pipeline** | `image_pipeline/bin/image-pipeline.mjs` | Audits Astro Image posture; gap-fills `public/` → WebP (optional AVIF). Not the primary path for content photos. |
| **Vectorize Pipeline** | `vectorize_pipeline/bin/vectorize-pipeline.mjs` | SVG wordmarks from fonts or authorized raster traces. |
| **Stylesheet Check** | `stylesheet_check/bin/stylesheet-check.mjs` | Scans segregated CSS for size/duplication/token hygiene. |
| **Instagram Clone** | `instagram_clone/bin/instagram-clone.mjs` | Public Instagram → local `feed.json` + media (no Meta API). |

### Cloudflare, headers & DNS

| Module | Binary (typical) | What it does |
|--------|------------------|--------------|
| **Cloudflare Agent** | `cloudflare-agent-toolkit/bin/cf-agent.mjs` | Audit/repair DNS, WAF, routes, deploy helpers; dry-run before `--apply`. |
| **Headers Deploy** | `headers_deploy/bin/headers-deploy.mjs` | Scaffolds/merges Cloudflare `public/_headers` (HSTS, CSP, cache). |
| **Cache Purge** | `cache_purge/bin/cache-purge.mjs` | Targeted Cloudflare edge cache invalidation; `warm` subcommand for GET warm (dry-run → `--apply`). |
| **Registrar** | `registrar/registrar.mjs` | Porkbun → Cloudflare NS/zone/redirect; dry-run default; MX gate on `ns update --apply`. |

### Quality, performance & a11y

| Module | Binary (typical) | What it does |
|--------|------------------|--------------|
| **Site Quality Smoke** | `site_quality_smoke/bin/site-quality-smoke.mjs` | Live header/cache/SEO/OG smoke plus HTML legal/cookies/image/font checks (`Disallow: /` exact match). |
| **PageSpeed Diagnostics** | `pagespeed_diagnostics/bin/pagespeed-diagnostics.mjs` | Google PSI (mobile/desktop) + agent batch/diff helpers (one fetch per strategy). |
| **Performance Fixes** | `performance_fixes/bin/performance-fixes.mjs` | Reads latest `pagespeed-*` JSON + suggests low-risk `_headers`/perf helpers (not auto-fix Lighthouse). |
| **Browser Diagnostics** | `browser_diagnostics/bin/browser-diagnostics.mjs` | Real-browser console/network classification (Playwright). |
| **WCAG Auditor** | `wcag_auditor/bin/wcag-auditor.mjs` | Accessibility **evidence gate** + stakeholder dashboard (`file:line` when mapped). Not a conformance certificate. |
| **Site Doctor** | `site_doctor/bin/site-doctor.mjs` | Combined local + Cloudflare health diagnostics (optional WCAG). |

### Toolkit hygiene

| Module | Binary (typical) | What it does |
|--------|------------------|--------------|
| **Privacy Check** | `privacy_check/bin/privacy-check.mjs` | Scans for secrets/PII before sharing or exporting the toolkit. |
| **Toolkit Purge** | `toolkit_purge/bin/toolkit-purge.mjs` | Removes toolkit `.runtime` residue before publish/share. |
| **Junk Purge** | `junk_purge/bin/junk-purge.mjs` | Cleans build junk/caches in the **client** project. |
| **Toolkit Verify** | `toolkit_verify/bin/toolkit-verify.mjs` | Self-validation pass for toolkit integrity. |

Also: `Optimize_Loop` / deploy helper scripts under `Web_Toolkit/` for common bat/command wrappers, plus `templates/discovery/` for Zenith discovery generators.

---

## What “required” means for healthy ops

| Always required for live CF / deploy work | Strongly recommended | Optional / when needed |
|-------------------------------------------|----------------------|-------------------------|
| Site profile + linked `Web_Toolkit/` | PostHog + GA4 | Instagram gallery |
| `CLOUDFLARE_API_TOKEN` | Brand Guide | Porkbun / registrar automation |
| `GOOGLE_PAGESPEED_API_KEY` (for PSI) | Headers / CSP baseline | Vectorize / special pipelines |
| Build + discovery-doctor green before prod | Local fonts + WebP/SVG media (AVIF later) | Full WCAG evidence gate |
| Legal/privacy page on production | Cookies notice when analytics on | |

---

## Where details live

| Topic | Doc |
|-------|-----|
| Agent zero-research entry | [`START_HERE.md`](./START_HERE.md) |
| Staged onboarding S0–S9 | [`docs/agent-skills/ONBOARDING_STAGES.md`](./docs/agent-skills/ONBOARDING_STAGES.md) |
| Full CLI sequence | [`Web_Toolkit/OPERATIONS.md`](./Web_Toolkit/OPERATIONS.md) |
| Incident / rollback | [`Web_Toolkit/RUNBOOKS.md`](./Web_Toolkit/RUNBOOKS.md) |
| Skill picker | [`docs/agent-skills/SKILL_INDEX.md`](./docs/agent-skills/SKILL_INDEX.md) |
| Module READMEs | [`Web_Toolkit/README.md`](./Web_Toolkit/README.md) |

---

## Suggestions baked into this guide

1. **Checkpoints beat mega-prompts** — one approval before prod/CF apply prevents accidents.
2. **Measure after warm** — PageSpeed right after a purge can look worse until the edge is warm.
3. **Targeted purge > “purge everything”** — unless you intentionally need a full wipe.
4. **100/100/100/100** — treat as aspiration; prefer stable green CWV + no functional regressions.
5. **Separate “upgrade packages” from “chase PSI”** when time is short — ship safe upgrades first.
6. **Modern media + local fonts + legal/cookies** are launch hygiene, not polish — check them every maintenance loop.
