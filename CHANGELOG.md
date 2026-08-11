# Changelog

All notable changes to Portable Web Toolkit are documented here.  
Version tags match root `VERSION` and `Web_Toolkit/package.json`.

## [Unreleased]

## [0.3.9] - 2026-08-11

### Added

- **Glassmorphism / frost UI WCAG path** (`wcag_auditor` 2.0.3): `docs/GLASSMORPHISM.md`, starter `frost-glass-contrast` evidence, suppressions with `outcomes: ["cantTell"]`, frost-aware axe remediations.
- **Brand Guide → tokens**: `brand-doctor sync-tokens` managed block in `src/styles/tokens.css`.
- **Astro Image default posture**: site-starter `OptimizedPicture`, Workers `imageService: 'compile'`, image-pipeline / site-readiness posture checks.
- **cache-purge warm**, discovery-doctor modular validate/report + tests, registrar MX gate, stylesheet-check architecture depth + README.
- **package-updater Astro path**: runs `npx --yes @astrojs/upgrade` (dry-run unless `--apply`; `--skip-astro-upgrade` / `--astro-tag`).
- Skills: `brand-doctor`, `discovery-doctor`, `image-pipeline`, `pagespeed-diagnostics`, `site-maintenance`, `wcag-auditor`.
- Client `.node-version` in `site-starter` (synced from root pin).

### Fixed

- discovery-doctor fail-closed (exit `2` on fail); registrar await + profile `.env` precedence; CF pages/deploy/analytics/headers/fix-permissions dry-run until `--apply`.
- DNS match by name+type with pagination; SSL rollback hosts scoped; site-quality-smoke exact `Disallow: /` + legal/cookie heuristics.
- Fail-loud toolkit-report / package-updater / project-init / site-readiness / Setup_agent_environment (`pwsh`).
- PSI single-fetch; privacy-check broader patterns.

### Changed

- Report path policy documented: client `output/` vs toolkit `.runtime/`.
- Removed `Web_Toolkit/.node-version` — canonical pin is repo root `.node-version`.
- HOW_TO honesty + module README / OPERATIONS / START_HERE alignment.

## [0.3.8] - 2026-08-11

### Fixed

- **`init-site-profile create`** now writes `<project-root>/<site-id>.site-profile.json` by default (client project) instead of toolkit `Web_Toolkit/site-profiles/`.
- Schema `$schema` prefers `./Web_Toolkit/site-profile.schema.json` for client profiles; deploy command defaults match site-starter scripts.

### Changed

- Expanded `init_site_profile` README/help with full flags, agent protocol, and `requirements --json`.
- Root `.env.example` is a **pointer only**; canonical client template remains `site-starter/.env.example` (optional operator defaults in `Web_Toolkit/.env.example`).

## [0.3.7] - 2026-08-11

### Changed

- **`.env` division of labor** (`site-starter/.env.example` + project-bootstrap): **A** user-pasted required APIs (Cloudflare token, PageSpeed), **B** agent+user naming/IDs, **C** recommended PostHog + GA4 (explain WHY early in S5/S7), **D** optional features.
- Porkbun documented as an **optional example** registrar integration — not required.
- Onboarding S5/S7, `site-onboarding`, checklist, and READMEs updated so agents propose names, challenge vague answers, and do not dump a blank `.env` on the user.

## [0.3.6] - 2026-08-11

### Added

- **Staged agent onboarding** (`docs/agent-skills/ONBOARDING_STAGES.md` S0–S9) with stop-and-ask checkpoints for host setup, Cloudflare token/MCP, Workers vs Pages, scaffold, readiness, and production auth.
- Core skill **`site-onboarding`** (`install_by_default: false`) — thin loader for the stages contract; wired in router, START_HERE, SKILL_INDEX, skill-pack, and project-init link lists.
- cf-agent token handoff recipe documenting Edit/Write scopes including **API Tokens Write**, **Account API Tokens Write**, and **Gateway Write**.

### Changed

- README get-started paste prompt and `docs/agent-skills/getting-started.md` lead with README → ONBOARDING_STAGES / `site-onboarding`.
- `REQUIRED_PERMISSION_NAMES` extended for token repair + Cloudflare One Gateway work.
- Host bootstrap sets `pyenv global` to the desired installed Python line in addition to workspace `local` venv (bash + PowerShell).
- Setup_agent_environment README Node pin wording refreshed to `.node-version` `26.7.0`.

## [0.3.5] - 2026-08-11

### Changed

- **Skill defaults are light**: only `portable-web-toolkit-router` has `install_by_default: true`. Core/optional skills require explicit `--skills` (project-init still links the core four for new sites).
- Refreshed site-starter floors via `package-updater`: Astro `^7.2.1`, `@astrojs/cloudflare` `^14.2.1`, Wrangler `^4.120.1`, Vite `^8.2.1`, `@astrojs/upgrade` `^0.7.4`, `@types/node` `^26.2.0`, `@cloudflare/workers-types` `^5.20260811.1`. TypeScript stays `^6.0.3` (capped; registry latest is 7.x).
- `.node-version` and host-bootstrap Node tarballs → **26.7.0**.

### Fixed

- Playwright axe focus-indicator probe scrolls focused controls into view with `scroll-behavior: auto` so headless Chromium does not no-op smooth scroll.

## [0.3.4] - 2026-08-04

### Fixed

- **WCAG Auditor stays inside Web_Toolkit**: website workflows no longer resolve `AI/wcag-auditor`, `WCAG_AUDITOR_ROOT`, or sibling checkouts. `core-path` always points at `Web_Toolkit/wcag_auditor`.
- Playwright CJS interop when browsers live under `playwright.default` (fixes “Unsupported Playwright browser: chromium”).

### Changed

- Re-bundled the full evidence engine under `Web_Toolkit/wcag_auditor` (self-contained for toolkit-managed sites).

## [0.3.3] - 2026-08-04

### Added

- Thin **WCAG Auditor bridge** (`Web_Toolkit/wcag_auditor/`) wired to the hard-segregated standalone package `@roydawsoniv/wcag-auditor` (`AI/wcag-auditor`).
- Launchers: `WCAG_Auditor.bat` / `WCAG_Auditor.command`.
- Site-profile schema + example knobs under `diagnostics.wcagAuditor`.
- Optional `site-doctor --wcag` step; OPERATIONS step 10a; agent routing in `START_HERE.md` / skills operations index.

### Changed

- Accessibility evidence engine is **hard-segregated** from the toolkit: core adapters/tests/docs live in `AI/wcag-auditor`; the toolkit keeps only a site-profile / Astro bridge.
- Refreshed `site-starter` floors to current registry latest: Astro `^7.1.6`, `@astrojs/cloudflare` `^14.1.7`, Wrangler `^4.118.0`, Vite `^8.2.0`, Playwright `^1.62.1`; `.node-version` → `26.6.0`. TypeScript stays on `^6.0.3` until `@astrojs/check` supports 7.x.

## [0.3.2] - 2026-07-29

### Added

- Introduced `portable-web-toolkit-router` minimalist global skill (~60 tokens) for on-demand skill routing across Antigravity, Cursor, Claude Code, Codex, and Copilot.
- Added `scripts/manage-project-skills.mjs` cross-platform manager for symlinking required skills into `<project>/.agents/skills/` with `--auto` optional skill detection.
- Created `docs/agent-skills/SKILL_INDEX.md` fast-lookup selection matrix for AI coding agents.
- Integrated automatic skill symlink scaffolding in `project-init apply-safe` and `.agents/skills/` health checks in `site-readiness`.

### Changed

- Updated skill status helper `scripts/check-agent-skills.mjs` to classify valid toolkit skill symlinks as `current-symlink`.
- Purged heavy web skills from global home discovery directories, moving all web skills to per-project symlink scope to prevent context bloat in non-web projects.

## [0.3.1] - 2026-07-26

### Fixed

- Corrected the documented skill-hash refresh command to use the tracked
  `scripts/update-skill-hashes.mjs` helper.

## [0.3.0] - 2026-07-26

### Added

- Versioned skill manifest, per-skill metadata, content hashes, and portable
  activation metadata.
- Read-only multi-client skill status reporting and an agent-driven,
  transactional installation protocol.
- Recovered and generalized the local-only Vectorize Pipeline as an optional,
  experimental skill and toolkit module.
- Release metadata validation, governance tests, a repository privacy gate, and
  pinned GitHub Actions validation.
- Contribution and private vulnerability-reporting guidance.

### Changed

- Refactored the master skill into a compact router with conditional references.
- Made client-repository policy authoritative for client work.
- Retired automatic skill replacement from compatibility installer and updater
  entrypoints; both now report status only.
- Kept governance files outside `skills/` so Antigravity discovers exactly the
  six functional skills.
- Added competing-owner activation fixtures and safety preflights to all six
  skills. Current skill versions are recorded in `skill-pack.json`.
- Aligned Vectorize Pipeline `0.1.1` with the repository's MIT license.
- Aligned all toolkit package metadata with the repository's MIT license.

### Fixed

- Update checks now distinguish a newer public version from a newer local
  development version.
- Privacy scans ignore reserved documentation domains while continuing to
  report real email addresses and credentials.

## [0.2.6] - 2026-07-18

### Fixed

- **macOS setup elevation** — `.command` launchers never receive Admin from Finder by themselves; bootstrap now shows a GUI administrator dialog, then requires a working `sudo` ticket. Failed elevation **stops** installs (no more `ensure_sudo || true` soft-continue).
- **macOS Node without Homebrew** — Node installs from the official `nodejs.org` darwin tarball into `/usr/local/lib/nodejs` (Homebrew is optional fallback only). Manifest keys: `tool.node.macos.{arm64,x64}.tarball_url`, `tool.node.posix.prefer_official_tarball`.
- **macOS Git / Xcode CLT** — bootstrap waits for the async Command Line Tools installer and fails clearly if Git is still missing (no silent “skipped”).
- **`.command` Terminal UX** — stay-open after double-click with clear admin messaging (pause skipped for `--yes`/`--agent`).

### Added

- **pyenv-gui (required)** — host bootstrap installs/detects the pyenv-native GUI companion; launch with `pyenv gui`. Manifest keys under `tool.pyenv_gui.*`; doctor fails when missing.
- **Executable launchers** — all tracked `.sh` / `.command` files are `100755` so clones/downloads are double-clickable; portable exports preserve mode bits.
- **Node-free setup launchers** — `setup-interactive.sh` / `setup-interactive.ps1` so `.command` / `.sh` / `.bat` work on machines without Node; bootstrap installs Node when missing.
- **Single-prompt agent setup** — scans missing/outdated tools, one Y (or `--yes`/`--agent`); coding agents run setup and let sudo/UAC prompt the user
- **Dynamic README versions** — `scripts/sync-readme-versions.mjs` syncs `VERSION`, `.node-version`, and site-starter pins into README (`npm run sync:readme-versions`)

### Changed

- **Python policy made explicit** — `tool.python.install_policy = pyenv-native-only`. Docs, wizard, and doctor no longer suggest system/winget/Homebrew Python; setup doctor lists `pyenv` + `pyenv-gui` as required.
- **site-starter** (Workers + Pages) — dependency floors bumped to current npm latest with `^` ranges:
  - `astro` `^7.1.1`, `@astrojs/cloudflare` `^14.1.3`, `vite` `^8.1.5`
  - `wrangler` `^4.112.0`, `@cloudflare/workers-types` `^5.20260718.1` (v5; required by current Wrangler peers)
  - `@types/node` `^26.1.1`, `yaml-language-server` `^1.24.0`
  - TypeScript stays on `^6.0.3` (latest 6.x) — `@astrojs/check` peers do not allow TypeScript 7 yet
- **site-starter** — `compatibility_date` → `2026-07-18`; Pages template now includes `@cloudflare/workers-types` + `cross-env`; `upgrade:wrangler` points at `Web_Toolkit/scripts/check-wrangler-versions.mjs`
- **Node pin** — `.node-version` + Linux bootstrap tarballs → `26.5.0` (`engines.node` remains `>=26`)
- **Python / pyenv-native policy** — desired Python `3.14` (fallback `3.14.6`, minimum still `3.13.0`); `pyenv-native` minimum `0.2.30`; setup doctor winget/brew targets updated off Python 3.12
- **package-updater** — preserves `^` / `~` / `>=` operators; caps `typescript` at latest 6.x until `@astrojs/check` supports 7

## [0.2.5] - 2026-06-25

### Added

- **Full Zenith discovery templates** — humans.txt, security.txt, content/search APIs, `lib/discovery/*`, Schema.astro, middleware (generic `site-config.ts`, no client data)
- **`Web_Toolkit/scripts/clean-local-cache.mjs`**, **`check-wrangler-versions.mjs`** — run from linked client projects
- **site-starter** — `astro.config.*.example.mjs`, structural `src/styles/tokens.css` + `global.css`

### Changed

- **site-starter `package.json`** — npm scripts call `./Web_Toolkit/` CLIs directly (headers, readiness, cache, wrangler check)
- **site-readiness** — checks `Web_Toolkit` link instead of local `scripts/` folder
- **`.gitignore`** — `**/Private_Site_Profiles/`

### Removed

- Legacy root **`templates/`** folder (superseded by `site-starter/`)
- **`site-starter/scripts/`** duplicate wrappers (logic lives in `Web_Toolkit/`)

## [0.2.3] - 2026-06-25

### Removed

- GitHub publish tooling (`publish-github.mjs`, `set-github-topics.mjs`, `verify-secrets-not-tracked.mjs`, `docs/github-repository.*`) — not part of the web toolkit product
- `MEMORY.example.md`, `RED_TEAM_REPORT.example.md` — operator notes belong in client projects, not the distribution repo
- `GH_TOKEN` / `GITHUB_TOKEN` placeholders from `.env.example` files

### Changed

- **README** / **AGENTS.md** — secrets and session memory documented for **client projects** only
- **Gitignore** — all `MEMORY.md` / `RED_TEAM_REPORT.md` paths local-only (no committed examples)

## [0.2.2] - 2026-06-25

### Added

- **`MEMORY.example.md`** and **`RED_TEAM_REPORT.example.md`** — committed templates; local copies gitignored
- **`docs/templates/AGENT.template.md`** — universal operator template moved out of agent entry path
- **`docs/templates/README.md`**, **`skills/CONTRIBUTING.md`**
- **`docs/github-repository.json`** — public GitHub description + topics (no secrets)
- **`scripts/set-github-topics.mjs`**, **`scripts/publish-github.mjs`**, **`scripts/verify-secrets-not-tracked.mjs`** — safe publish flow; tokens read from gitignored `.env` only
- GitHub token detection in **`privacy_check`** patterns

### Changed

- **Gitignore** — hardened for `.env`, `.env.local`, `secrets/`, `github-repository.local.json`; operator `MEMORY.md` / `RED_TEAM_REPORT.md` stay local
- **Removed** deprecated `Web_Toolkit/AGENT.md`; agents use `START_HERE.md` + `AGENTS.md` only
- **`ARCHITECTURE.md`** — v0.2.x agentic layout, site-readiness orchestrator, skill extension guide
- **`OPERATIONS.md`** — points agents to site-readiness JSON first
- **`portable-web-toolkit` skill** — deduplicated session-start blocks
- Stylesheet-check and discovery template refs → `AGENTS.md` (not universal template)

## [0.2.1] - 2026-06-25

### Added

- **MIT `LICENSE`** at repo root; aligned `plugin.json` and package metadata
- **`scripts/link-web-toolkit.mjs`**, **`install-agent-skills.mjs`**, **`update-toolkit.mjs`** — cross-platform entry points
- **`skills/CROSS_PLATFORM.md`** — Windows / macOS / Linux conventions
- **Interactive setup wizard** — `setup-interactive.mjs` + `setup-menu.json`; per-component opt-in/out
- **Root launchers** — `Setup_Agent_Environment.sh` / `.command` (macOS/Linux)
- **`Web_Toolkit/registrar/README.md`**

### Changed

- **README** — user-first copy; single AI agent install prompt; optional machine setup wizard
- **Node policy** — unified at `>=26` (`.node-version` `26.4.0`, manifest, `engines`, site-starter)
- **`Setup_Agent_Environment.*`** — interactive menu before bootstrap; repo-root workspace default
- **`TOOLKIT_TEMPLATES.md`** — points to `site-starter/` (removed dead in-toolkit paths)
- **`Web_Toolkit/README.md`** — `site_quality_smoke` replaces broken `smoke_doctor` link
- Site-starter examples use neutral client names (no project-specific folders)
- `site-readiness` link fix uses `link-web-toolkit.mjs`

## [0.2.0] - 2026-06-25

### Added

- **Zero-research layer:** `START_HERE.md`, five agent skills
- **`site-starter/`** — Workers and Pages templates + helper scripts
- **`site_readiness`** CLI — sandbox-aware run-all checks
- **`instagram_clone`** — env-driven handle, audit subcommand
- **`scripts/update-toolkit.*`** and **`scripts/check-toolkit-update.mjs`**
- Manifest-driven batch quality smoke (operator manifest gitignored)

### Changed

- Repo root is toolkit meta only; `site-readiness` leads OPERATIONS/AGENTS
- Hardened `.gitignore` for operator data

## [0.1.0] - 2026-06-16

- Initial toolkit with cross-platform agent skills installer
