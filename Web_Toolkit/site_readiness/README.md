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
2. Toolkit link (`Web_Toolkit` / `web_toolkit`)
3. Project starter files (README, MEMORY, package, wrangler, scripts)
4. Site profile completeness
5. Astro env doctor (if `package.json` exists)
6. Stylesheet check (if `src/` exists)
7. Discovery doctor (if `dist/` exists)
8. Instagram audit (if `feed.json` exists)
9. Integration doctor (full mode only)
10. `npm run build` (only with `--build`)

## Outputs

- `output/site-readiness-<timestamp>.json` — machine-readable for agents
- `output/site-readiness-<timestamp>.md` — human-readable summary
- Console summary with PASS / WARN / FAIL / SKIP per step

## Auto-fixes

`--apply-safe-fixes` runs **project-init apply-safe** only (never overwrites existing files).

`--install-deps` allows dependency install during apply-safe.

Mutating deploy, DNS, and Cloudflare changes are **never** auto-applied here — use cf-agent with dry-run → `--apply`.
