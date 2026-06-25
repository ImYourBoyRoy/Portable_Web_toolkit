# Red Team Report: Portable Web Toolkit (example)

Copy to `RED_TEAM_REPORT.md` for local operator audit notes. **`RED_TEAM_REPORT.md` is gitignored.**

Audit date: 2026-06-25  
Status: **agentic-ready** (v0.2.x)

## Strengths

- Zero-research layer: `START_HERE.md`, five skills, `site-readiness` JSON orchestrator
- Safety defaults: dry-run before `--apply` on CF, DNS, cache, zone harden
- Clean separation: toolkit repo vs client site vs linked `Web_Toolkit/`
- Cross-platform: Node `.mjs` wrappers, `link-web-toolkit.mjs`, skill reinstall on update
- Publish hygiene: MIT license, privacy scan, toolkit verify, export excludes private profiles

## Remediated (historical)

- Client-specific branding removed from toolkit source
- `MEMORY.md` / `RED_TEAM_REPORT.md` gitignored; examples committed instead
- Root universal `AGENT.md` moved to `docs/templates/AGENT.template.md`
- Deprecated `Web_Toolkit/AGENT.md` removed
- Astro 7 + Node 26 aligned in `site-starter/` and docs

## Still operator-dependent

- Live deploy/purge/harden requires explicit `--apply` and valid credentials
- Private profiles outside repo; pass `--site-profile`
- Client `MEMORY.md` lives in each site project (not this toolkit repo)

## Recommended next hardening

- Local MCP wrapper over stable CLI JSON outputs (read-only first)
- Centralize remaining per-tool output path helpers into `shared/lib/`
- Optional profile checksum before deploy execution

## Agent canonical path

1. `check-toolkit-update.mjs` → `update-toolkit.mjs` if stale  
2. `site-readiness run` → read `output/site-readiness-*.json`  
3. `portable-web-toolkit` skill for deploy/discovery sequence  
4. `OPERATIONS.md` as reference only (not primary navigation)

---
*Template maintained by Roy Dawson IV — update your local `RED_TEAM_REPORT.md` after each audit.*
