# Portable Toolkit Memory

## Project Snapshot

- Toolkit: AI-agent-first portable website diagnostics, PageSpeed, Cloudflare, media, profile, and publishing tools.
- Publish posture: root package metadata exists at `package.json`; package name is `@imyourboyroy/web-toolkit`; license is currently conservative `UNLICENSED` pending Roy's final license decision.
- Private profiles must live outside the published toolkit and be passed with `--site-profile <path>`.
- **Default site stack for new web work**: Astro on Vite, deployed to Cloudflare (Pages + Workers first, free tier preferred).

## Verified Resources & Versions

Use these authoritative sources before pinning versions or recommending APIs. **Do not substitute model memory for these checks.**

| Area | Authoritative source | Use for |
|------|----------------------|---------|
| Astro | https://docs.astro.build/ | adapters, routing, SSR/SSG, config, migrations |
| Astro changelog | https://github.com/withastro/astro/releases | breaking changes between Astro majors/minors |
| Vite | https://vite.dev/ | build config, plugin API, current defaults |
| Cloudflare Pages | https://developers.cloudflare.com/pages/ | Astro deploy, build output, custom domains |
| Cloudflare Workers | https://developers.cloudflare.com/workers/ | edge logic, bindings, limits, free-tier fit |
| Wrangler CLI | https://developers.cloudflare.com/workers/wrangler/ | deploy commands, config shape, secrets |
| `@astrojs/cloudflare` | https://docs.astro.build/en/guides/integrations-guide/cloudflare/ | adapter setup, output dirs, preview/deploy |
| Node.js releases | https://nodejs.org/en/about/previous-releases | runtime baseline (repo currently targets `>=25.9.0`) |
| npm package versions | https://www.npmjs.com/ or `npm view <pkg> version` | exact package pins (`astro`, `wrangler`, etc.) |
| Rust releases | https://releases.rs/ | toolchain/edition verification when Cargo is in scope |
| crates.io | https://crates.io/ | Rust crate versions for Workers WASM or CLI tools |

### Repo-pinned baseline (confirmed in workspace — re-verify before bumps)

- **Node**: `>=25.9.0` (`.node-version` = `25.9.0` at workspace + toolkit roots) — source: root/toolkit `package.json`, `.node-version`
- **Astro**: `^6.1.6` — source: root `package.json` (2026-06-15)
- **`@astrojs/cloudflare`**: `^13.1.1` — source: root `package.json` (2026-06-15)
- **Wrangler**: `^4.82.2` — source: root `package.json` (2026-06-15)
- **Sharp**: `^0.34.5` — source: root `package.json` (2026-06-15)

### Research delta log (update when verified versions differ from prior assumptions)

- **2026-06-15**: Workspace standardized on Astro 6 + Cloudflare adapter 13 + Wrangler 4; agents must verify npm/docs before proposing downgrades to Astro 4-era patterns or Wrangler v3 syntax.
- **Rule**: When bumping any of the above, check Astro adapter compatibility, Wrangler major notes, and Cloudflare Pages output layout; record migration notes here.

## Working Directory Map

- `shared/lib/`: shared env/profile/runtime helpers.
- `site-profiles/`: public examples only (`example-workers.json`, `example-pages.json`).
- `.runtime/`: generated, ignored, purgeable reports/exports/sessions.
- `scripts/`: publish/export/bootstrap helpers, including `check-syntax.mjs` and `export-portable-toolkit.mjs`.
- `templates/discovery/`: generic copy-ready discovery generator references for client sites.
- `cloudflare-agent-toolkit/`: Cloudflare audit/deploy/cache/rules/DNS/performance automation.
- `pagespeed_diagnostics/`: PSI diagnostics plus AI-agent batch/diff JSON commands.
- `site_quality_smoke/`, `browser_diagnostics/`, `integration_doctor/`, `site_doctor/`: quality and runtime diagnostics.
- `brand_doctor/`, `image_pipeline/`: visual asset and image tooling.
- `toolkit_purge/`, `privacy_check/`, `stylesheet_check/`, `toolkit_verify/`, `toolkit_report/`: publish and integrity tooling.

## Current Goals

- Keep the toolkit reusable across many sites without private state contaminating source.
- Keep outputs predictable: project diagnostics in `<projectRoot>/output/`; toolkit self/runtime artifacts in `.runtime/`.
- Prepare a safe publishing path before public release.
- Prefer CLI as canonical execution; add local MCP first, then Cloudflare-hosted MCP for read-only/report-oriented remote access.

## Active Tasks / TODOs

- Decide final public license before broad release (`LICENSE.md` currently says all rights reserved).
- If publishing to npm, confirm the `@imyourboyroy` npm scope is available/owned.
- Add a local MCP wrapper as a separate package after the CLI surface stabilizes.
- Consider a Cloudflare-hosted MCP later for authenticated read-only audits/report retrieval.

## Architecture Notes

- Site profiles may use relative `projectRoot` values resolved from profile-file location.
- `hosts.development` is optional; tools should skip development checks when absent.
- Public examples are `site-profiles/example-workers.json` and `site-profiles/example-pages.json`.
- `toolkit_verify` now resolves scripts from `PORTABLE_ROOT`, not from the caller's cwd.
- `Optimize_Loop.bat` no longer auto-selects the first JSON profile because public examples should never be deployed accidentally.
- `toolkit_purge` treats `.runtime`, targeted tool `output/`/`dist/`, `.cf-agent`, Python caches, zips, and export metadata as generated residue.
- Astro deploy path: build → `cf-agent deploy pages|workers` (or `cf-deploy-pages.mjs` / `cf-deploy-workers.mjs` in cloudflare-agent-toolkit/bin/) → Wrangler Pages or Workers.
- Account-level deploy verification: `cf-agent deployment audit --site-profile <path>` (no production zone required).
- Edge-first: route new backend behavior to Workers/Pages Functions/KV/D1/R2 before external platforms unless documented exception exists in this memory file.

## Decisions & Conventions

- Keep secrets in target project `.env` or shell, not profiles.
- Keep non-example profiles outside the repository.
- CLI flags override profile/default values.
- Mutating tools must keep dry-run/apply gates.
- Use `CLOUDFLARE_ACCOUNT_ID` as the canonical Cloudflare account ID variable; `CF_ACCOUNT_ID` may remain only as backward-compatible fallback in code.
- **Web stack default**: Astro on Vite, hosted on Cloudflare free tier; prefer Workers/bindings over external services when reasonable.
- **Version policy**: research latest stable/current releases from official sources; never assume model-memory versions; document verified pins and breaking changes in this file.
- **Build policy**: run/check Astro builds before deploy claims; use repo deploy wrappers; dry-run Cloudflare mutations first.
- **Stylesheet policy**: externalize CSS into segregated files (tokens → base → layout → components → pages); no repeated CSS in `.astro`/`.svelte`/UI files; ~500 lines max per stylesheet; token-driven theming via CSS custom properties; document paths in **Stylesheet Map** section when introduced; run `stylesheet-check scan --root <project>` when the toolkit is present.

## Known Issues / Risks

- Some deeper tools still have individual output helper implementations; the behavior is now documented, but future cleanup could centralize all report path helpers.
- Cloudflare-hosted MCP should not expose unrestricted mutation or local filesystem assumptions.
- `npm pack --dry-run` succeeds, but final package naming/license/repository metadata should be confirmed before publish.
- Root wrapper npm scripts require `PORTABLE_DEFAULT_PROFILE` or an explicit `--site-profile` via `scripts/site-tool.mjs`.

## Recent Changes

- Added shared site-profile validation, deploy-command allowlisting, and project-root guards.
- Added shared public HTTP URL guardrails for discovery/integration/sourcing fetch helpers.
- Fixed privacy scanner profile detection and expanded private-profile coverage.
- Made legacy zone hardening, optimize loop cache purge, and root npm purge scripts dry-run by default.
- Made DNS fix record creation opt-in via `--create-missing`.
- Replaced project-specific root npm scripts with neutral `site-tool.mjs` / `cf-deploy-pages.mjs` wrappers.
- Tightened toolkit purge scope and removed automatic Pillow installation from image pipeline.
- Updated root `.gitignore`, `.env.example`, `.node-version`, and red-team report.
- Added `stylesheet_check` CLI to enforce external CSS, token placement, 500-line limits, and duplicate rule/token detection.
- Added **Verified Resources & Versions** section to this toolkit's `MEMORY.md` for authoritative doc/registry links and repo-pinned baselines.
- Added root `package.json`, `LICENSE.md`, and `scripts/check-syntax.mjs` for publishing readiness.
- Replaced invalid sample site profile with public `example-workers.json` and `example-pages.json` profiles.
- Removed client-specific `example_src/` debris from the workspace wrapper and added generic `templates/discovery/` references.
- Made development hosts optional in `site-profile.schema.json` and updated profile initialization prompts/default output names.
- Updated `site_quality_smoke` and browser diagnostics to tolerate profiles without development hosts.
- Removed hardcoded Roy OG fallback from Brand Doctor and replaced it with generic site-safe defaults.
- Normalized help behavior for `discovery-doctor`, `project-init --help`, and `sourcing-doctor --help`.
- Updated export metadata to report actual included example profiles.
- Expanded purge/export rules to exclude `.git`, runtime, generated outputs, and package residue.
- Pre-push audit removed RCCinema/rccinema client debris from the workspace wrapper and replaced it with generic discovery templates.
- **2026-06-25:** Zero-research layer: `START_HERE.md`, skills suite (`portable-web-toolkit` master, `site-readiness`, `site-starter`, `toolkit-update`, `instagram-clone`), `scripts/update-toolkit.*`, OPERATIONS/AGENTS lead with site-readiness.
- Expanded `AGENT.md` §11: custom discovery generators (no Astro sitemap/robots), `llms.txt` on every build, project-local Brand Guide (create if missing), no default logos/icons, SVG-first + autonomous WebP pipeline.
- Major `AGENT.md` upgrade: user-agnostic operator profile (no hardcoded identity), AGENT vs AGENTS, JS/TS rules, full Zenith discovery layer (llms-full, APIs, humans, security.txt, JSON-LD, `_headers`), a11y/perf, meta baseline, §15 integrations, site launch workflow (staging → smoke → discovery pass), verification-before-completion, secrets hygiene. Synced `AGENTS.md` deploy gate.

## Validation / Tests Run

- `node scripts/check-syntax.mjs` passed: 167 `.mjs` files, 0 failures (2026-06-16).
- `node toolkit_verify/bin/toolkit-verify.mjs` passed all checks (2026-06-16).
- `node privacy_check/bin/privacy-check.mjs scan --root . --json` returned 0 findings (2026-06-16).
- `npm pack --dry-run` succeeded: `@imyourboyroy/web-toolkit@0.1.0`, 297 files (2026-06-16).

## Next Session Quick Start

1. Run `node ./scripts/check-syntax.mjs`.
2. Run `node ./toolkit_verify/bin/toolkit-verify.mjs`.
3. Run `node ./toolkit_purge/bin/toolkit-purge.mjs --apply` before packaging or sharing.
4. Run `node ./privacy_check/bin/privacy-check.mjs scan --root . --json` after purge.
5. Decide license and repository/package destination before public release.