---
name: site-readiness
description: Run sandbox-aware readiness checks for a Portable Web Toolkit-managed Astro client site and produce structured next actions. Use before material site work, after scaffolding or configuration changes, during release preparation, or when project state is uncertain. Do not treat readiness findings as authorization to install, update, deploy, or mutate infrastructure.
---

# Site Readiness

Run before material work when current readiness evidence is absent or stale.

## Preflight

Resolve the active client repository, read its applicable instructions, and
preserve unrelated work. Confirm the toolkit link and site profile belong to
this client before running commands.

## Command

```bash
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root . --site-profile ./<name>.site-profile.json
```

Shortcuts: `npm run readiness` | `npm run readiness:fix`

An ordinary readiness request may write its diagnostic reports but does not
apply project fixes. Do not use `readiness:fix` or any mutation flag without
separate authorization for the proposed fixes.

## Flags

| Flag | Effect |
|------|--------|
| `--apply-safe-fixes` | Authorized `project-init apply-safe` (never overwrites) |
| `--install-deps` | Separately authorize dependency installation |
| `--build` | Run the repository-authorized build and create its artifacts |
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
3. Propose fixes; apply only the authorized set, then re-run
4. Then **portable-web-toolkit** for deploy  
5. **site-doctor** only when site is live  

Record the toolkit version as context. A newer toolkit version is a separate
finding, not permission to pull source or reinstall skills. Use
**toolkit-update** when comparison or migration is requested.

## Never auto-applied

Deploy, DNS, cf-agent `--apply`, cache purge, registrar.
