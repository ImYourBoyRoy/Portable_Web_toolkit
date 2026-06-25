# Portable Toolkit Memory (example)

Copy to `MEMORY.md` in this folder for local operator notes. **`MEMORY.md` is gitignored** — never commit session memory or secrets.

## Project Snapshot

- Toolkit: AI-agent-first portable website diagnostics, Cloudflare, PageSpeed, media, profile, and publishing tools.
- Version: see root `VERSION` and `Web_Toolkit/package.json` (currently `0.2.x`).
- Publish posture: `@imyourboyroy/web-toolkit` npm package; **MIT** license at repo root.
- **Default client stack**: Astro 7 on Vite + Cloudflare Workers or Pages; Node `>=26`.

## Verified Resources & Versions

Re-verify from official sources before bumps — do not trust model memory.

| Area | Source |
|------|--------|
| Astro | https://docs.astro.build/ |
| Cloudflare Workers/Pages | https://developers.cloudflare.com/ |
| Wrangler | https://developers.cloudflare.com/workers/wrangler/ |
| Node releases | https://nodejs.org/en/about/previous-releases |

### Repo-pinned baseline (check `site-starter/` before changing)

- **Node**: `>=26` (`.node-version` `26.4.0`)
- **Astro**: `^7.0.2` — `site-starter/workers.package.json`
- **`@astrojs/cloudflare`**: `^14.0.0`
- **Wrangler**: `^4.104.0`

## Working Directory Map

- Repo root: skills, `START_HERE.md`, `site-starter/`, install/update scripts
- `Web_Toolkit/`: all CLIs (`site_readiness`, `cf-agent`, `discovery_doctor`, …)
- `Web_Toolkit/shared/lib/`: env, profile, runtime helpers
- `Web_Toolkit/site-profiles/`: public examples only
- `Web_Toolkit/templates/discovery/`: generic discovery generator copies for client sites
- `Web_Toolkit/.runtime/`: generated reports (gitignored)

## Architecture Notes

- **Agent entry**: `START_HERE.md` → `site-readiness run` → JSON report → skills
- Site profiles drive deploy; secrets in client `.env` only
- `Optimize_Loop.bat` never auto-selects a profile
- Mutations: audit → dry-run → `--apply`

## Active Tasks / TODOs

- (Your local tasks here)

## Recent Changes

- (Your session deltas here)

## Validation / Tests Run

- (Commands + dates you actually ran)

## Next Session Quick Start

1. `node ./scripts/check-toolkit-update.mjs`
2. `node ./Web_Toolkit/toolkit_verify/bin/toolkit-verify.mjs`
3. On client site: `site-readiness run --project-root .`
