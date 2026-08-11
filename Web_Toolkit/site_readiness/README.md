# Site Readiness

**Run-all** readiness pass for client Astro sites — collects local state, runs phased toolkit checks, and prints what is missing or what to do next.

Designed for **agents in sandboxed or full-access environments**.

## When to use

| Command | Use when |
|---------|----------|
| `site-readiness run` | Starting a session, after scaffolding, before first deploy |
| `site-doctor run` | Live site triage (preview, browser, production smoke, Cloudflare audits) |
| `toolkit-report generate` | Fast static snapshot only |
| `project-init audit` | Bootstrap file gaps only |

## Usage

```powershell
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root .

# Safe auto-fix missing README/MEMORY/.gitignore/.env.example first
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root . --apply-safe-fixes

# Include build + skip network integration checks
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root . --build --skip-network
```

From `site-starter` projects: `npm run readiness` (after copying scripts).

## Environment modes

| Mode | Detected when | Behavior |
|------|---------------|----------|
| `sandbox` | No network and/or sandbox env hints | Skips integration doctor; emphasizes local file checks |
| `local` | Network OK, no Cloudflare `.env` | Runs local doctors; skips live CF integration |
| `full` | Network + `CLOUDFLARE_API_TOKEN` + account ID | Includes integration doctor |

## Phases (default `run`)

1. Capability probe
2. Optional **apply-safe-fixes** (`project-init apply-safe`; failures exit non-zero)
3. Toolkit link (`Web_Toolkit` / `web_toolkit`)
4. Project starter files (README, MEMORY, package, wrangler, scripts)
5. Site profile completeness
6. **Skill architecture** — internal `.agents/skills/` symlinks, global router skill, legacy global skill purge warnings
7. Astro env doctor (if `package.json` exists)
8. **Image posture** — Astro Image/`Picture` defaults + `public/` gap-fill hints (`image-pipeline audit`)
9. Stylesheet check (if `src/` exists) — includes `tokens.css` / `global.css` / Layout ownership
10. Discovery doctor (if `dist/` exists)
11. Instagram audit (if `feed.json` exists)
12. Integration doctor (full mode only)
13. `npm run build` (only with `--build`)

Reports land under **`<project>/output/`** (client diagnostics). Toolkit self-checks stay in `Web_Toolkit/.runtime/`.
## Auto-fixes

`--apply-safe-fixes` runs **project-init apply-safe** only (never overwrites existing files).

`--install-deps` allows dependency install during apply-safe.

Mutating deploy, DNS, and Cloudflare changes are **never** auto-applied here — use cf-agent with dry-run → `--apply`.
