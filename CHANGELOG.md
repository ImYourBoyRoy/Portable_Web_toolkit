# Changelog

All notable changes to Portable Web Toolkit are documented here.  
Version tags match root `VERSION` and `Web_Toolkit/package.json`.

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
