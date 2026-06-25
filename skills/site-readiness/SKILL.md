---
name: site-readiness
description: Runs sandbox-aware run-all readiness checks on an Astro client site and writes JSON/Markdown reports with next steps. Use at the start of every client site session, after scaffolding, or when unsure what is missing.
---

# Site Readiness

**Run first** on every client site session.

## Command

```powershell
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root . --site-profile ./<name>.site-profile.json
```

Shortcuts: `npm run readiness` | `npm run readiness:fix`

## Flags

| Flag | Effect |
|------|--------|
| `--apply-safe-fixes` | `project-init apply-safe` (never overwrites) |
| `--install-deps` | Allow npm install during apply-safe |
| `--build` | Include `npm run build` |
| `--skip-network` | Offline/sandbox — skip integration |

## Modes (auto)

`sandbox` | `local` | `full` (network + CF `.env`)

## Outputs

- `output/site-readiness-*.json` — **agents read this first**
- `output/site-readiness-*.md` — human summary
- Exit: 0 pass, 2 warn, 1 fail

## Workflow

1. Run readiness  
2. Read `nextSteps` + `recommendedFixes` in JSON  
3. Fix → re-run until pass  
4. Then **portable-web-toolkit** for deploy  
5. **site-doctor** only when site is live  

## Never auto-applied

Deploy, DNS, cf-agent `--apply`, cache purge, registrar.
