# Changelog

All notable changes to Portable Web Toolkit are documented here.  
Version tags match root `VERSION` and `Web_Toolkit/package.json`.

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
