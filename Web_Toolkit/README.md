# Portable Astro + Cloudflare Toolkit [ROY-STANDARD]

## What this is

A reusable operator + AI toolkit for standing up, checking, diagnosing, hardening, and shipping high-fidelity Astro/Vite websites on Cloudflare.

This toolkit is **highly portable**, **spec-driven**, and **AI-Ready**. It is designed to be the "Connective Tissue" between a fresh project and a production-grade, premium deployment.

**Node pin:** exact runtime pin is the **repository root** [`.node-version`](../.node-version) only. Do not place a second `.node-version` under `Web_Toolkit/`. Module `engines.node` floors stay `>=26`.

## The Brain: `site-profile.json`

Every tool in this toolkit is an execution engine for the **[Master Site Specification](./site-profile.schema.json)**.

- **Single Source of Truth**: Site branding, deployment routes, and performance targets live in your `site-profiles/*.json`.
- **Stateless Operation**: Tools read the specification and the target project's `.env`, leaving the toolkit itself completely clean and portable.

---

## 🎛️ Command Center

### [Optimize_Loop.bat](./Optimize_Loop.bat)

The premium automated CI loop. It unifies the build, deploy, purge, and verify phases into a single command.

- **Usage**: `.\Web_Toolkit\Optimize_Loop.bat [--site-profile <path>]`

---

## 🔍 Phase 1: Discovery & Content

Determine project requirements and retrieve legacy assets.

- **[Discovery Doctor](./discovery_doctor/README.md)**: Zenith discovery audit (**fail-closed**, exit `2` on FAIL). Sitemap-index OK; BreadcrumbList warn-only on homepage.
- **[Sourcing Doctor](./sourcing_doctor/README.md)**: High-fidelity content extraction (WordPress/Wix REST API to JSON).
- **[Site Readiness](./site_readiness/README.md)**: Run-all sandbox-aware readiness pass with next-step report for client projects.
- **[Project Init](./project_init/README.md)**: Safe starter gaps (skill links, scaffolding); skill-link failures are fail-loud.
- **[Package Updater](./package_updater/README.md)**: `@astrojs/upgrade` for Astro sites + dependency pin bumps; non-zero if upgrade/registry fails.
- **[Instagram Clone](./instagram_clone/README.md)**: Public-profile clone → `feed.json` + local media (no Meta API). Set `INSTAGRAM_USERNAME` in the target project `.env`.
- **[Privacy Check](./privacy_check/README.md)**: Scans for credentials and sensitive data before exporting or sharing the toolkit.

---

## 🛠️ Phase 2: Readiness & Setup

Prepare the workstation and target project for development.

- **[Setup Agent Environment](./Setup_agent_environment/README.md)**: Manifest-driven, OS-native workstation bootstrap for Codex/Antigravity/Cloudflare work with early elevation, latest-current Node enforcement, `pyenv-native` Python management, Linux official Node archives, and macOS Command Line Tools detection.
- **[Setup Astro Environment](./Setup_astro_environment/README.md)**: Non-destructive project bootstrapping and "hole-finding."
- **[Init Site Profile](./init_site_profile/README.md)**: Agent intake helper — writes `<client>/<siteId>.site-profile.json` (not into toolkit `site-profiles/`).
- **[Integration Doctor](./integration_doctor/README.md)**: Validates `.env` posture and live API connectivity (Forms, Analytics, Auth).

---

## 🎨 Phase 3: Artistic Restoration & Media

Automate high-fidelity branding and asset generation.

- **[Brand Doctor](./brand_doctor/README.md)**: Branding automation (favicon/OG) + Brand Guide → `tokens.css` via `sync-tokens`. Agents still treat `BRAND_GUIDE.md` as identity source of truth.
- **[Image Pipeline](./image_pipeline/README.md)**: Astro Image posture audit + gap-fill WebP/AVIF for leftover `public/` rasters (not the primary content-photo path).
- **[Vectorize Pipeline](./vectorize_pipeline/README.md)**: Creates clean SVG wordmarks from licensed fonts or traces authorized raster artwork with VTracer.
- **[Stylesheet Check](./stylesheet_check/README.md)**: Segregated CSS size/duplication/token hygiene + Astro `tokens.css` / `global.css` / Layout ownership checks.

---

## ☁️ Phase 4: Edge Deployment & Hardening

Standardize the Cloudflare posture and ship the site.

- **[Cloudflare Agent](./cloudflare-agent-toolkit/README.md)**: Audit and repair DNS, WAF rules, and deployment routes.
- **Cloudflare Agent Performance Audit**: AI-agent-only JSON audit of speed-critical Cloudflare switches (`performance audit`).
- **[Headers Deploy](./headers_deploy/README.md)**: `public/_headers` scaffold and deploy-time merge.
- **[Cache Purge](./cache_purge/README.md)**: Targeted edge invalidation + `warm` (dry-run lists URLs; `--apply` GETs).
- **[Registrar](./registrar/README.md)**: Porkbun → Cloudflare NS/zone/redirect; MX gate on NS cutover.
- **[Performance Fixes](./performance_fixes/README.md)**: Reads latest PSI JSON and suggests low-risk header/perf helpers.

---

## 🏁 Phase 5: Zenith Verification

Verify that the site meets all performance and quality targets.

- **[Site Quality Smoke](./site_quality_smoke/README.md)**: Post-deployment header, cache, SEO, and metadata verification (replaces legacy smoke_doctor).
- **[PageSpeed Diagnostics](./pagespeed_diagnostics/README.md)**: Automated Google PSI metrics tracking.
- **PageSpeed Agent Batch/Diff**: JSON-only, problem-only PageSpeed batch runner and regression comparator for AI agents.
- **[Browser Diagnostics](./browser_diagnostics/README.md)**: Real-browser error scraping and request classification.
- **[WCAG Auditor](./wcag_auditor/README.md)**: Self-contained accessibility evidence gate under `Web_Toolkit/wcag_auditor`. Does **not** certify WCAG conformance. Website workflows must not resolve outside this toolkit.
- **[Site Doctor](./site_doctor/README.md)**: Combined local + cloud health diagnostics (optional `--wcag`).

---

## 🧹 Phase 6: Toolkit Integrity

Keeping the portable workspace clean and validated.

- **[Toolkit Purge](./toolkit_purge/README.md)**: Removes runtime residue from the toolkit directory.
- **[Junk Purge](./junk_purge/README.md)**: Cleans build-junk and cache files from the target project.
- **[Toolkit Verify](./toolkit_verify/README.md)**: Self-validation pass for the toolkit logic.
- **[Toolkit Report](./toolkit_report/README.md)**: Generates a project readiness snapshot.

---

## Multi-Site Publishing Posture

The publishable toolkit source should contain code, docs, shared helpers, and public example profiles only.

- Public examples: `site-profiles/example-workers.json`, `site-profiles/example-pages.json`.
- Generic discovery references: `templates/discovery/`.
- Private profiles: keep outside the published repository and pass them with `--site-profile <path>`.
- Secrets: keep in the target project root `.env` or shell environment; never commit toolkit `.env`.
- Before publishing or zipping, run:

```powershell
node .\toolkit_purge\bin\toolkit-purge.mjs --apply
node .\toolkit_verify\bin\toolkit-verify.mjs
node .\privacy_check\bin\privacy-check.mjs scan --root . --json
```

## Output and Input Standard

- **Inputs**: site profile JSON + target project root `.env` + explicit CLI flags.
- **Target-project reports**: `<projectRoot>/output/` for diagnostics tied to a specific website (intentional — do not relocate into toolkit `.runtime/`).
- **Toolkit runtime reports**: `Web_Toolkit/.runtime/` for toolkit self-checks, exports, sessions, and Cloudflare-agent operational reports.
- **Generated site assets**: written into the target project only when a command is explicitly applied, for example `--apply`.
- **Exported toolkit copies**: created under `.runtime/exports/` by default and sanitized before sharing.

## MCP Direction

Recommended path:

1. Keep this CLI toolkit as the source of truth first.
2. Add a local MCP wrapper that exposes stable CLI commands as tools for nearby agents.
3. Add a Cloudflare-hosted remote MCP only for safe read-only audits and agent status/report retrieval.
4. Keep mutating operations local or require explicit auth, dry-run, and apply gates before any remote execution.

This keeps the toolkit useful for many sites without turning a remote MCP into a high-risk deployment/secrets surface.

---
*Created by: Roy Dawson IV*  
*GitHub: [https://github.com/imyourboyroy](https://github.com/imyourboyroy)*

