---
name: portable-web-toolkit
description: Operates the Portable Astro + Cloudflare Web Toolkit for client site setup, discovery audits, cf-agent deploy/hardening, and staged launches. Use when working with site-profiles, discovery-doctor, cf-agent, Astro on Cloudflare, or Web_Toolkit operator CLIs.
---

# Portable Web Toolkit

Reusable operator toolkit for Astro + Vite + Cloudflare client sites. Execution engine for **`site-profile.json`** specs.

## When to use

- Standing up, auditing, hardening, or deploying an Astro/Cloudflare site
- Running discovery-doctor, cf-agent, site-doctor, brand-doctor, pagespeed diagnostics
- Client site uses or should use the portable toolkit under `Web_Toolkit/`

**When NOT to use:** Pure Python/Rust apps with no web stack; Tauri/desktop-only repos (unless deploying their marketing site).

## Process

### 1. Locate toolkit and target

```
Toolkit root:  Web_Toolkit/   (under Portable_Web_toolkit repo)
Target site:   client project root (where package.json / astro.config lives)
Profile:       site-profiles/<name>.json OR private path via --site-profile
Secrets:       target project .env (NOT toolkit .env)
```

After skill install, repo cache: `%USERPROFILE%\.cursor\Portable_Web_toolkit\` (or local path).

### 2. Read spec and phase

1. Load site profile JSON
2. Read `Web_Toolkit/OPERATIONS.md` for full sequence
3. If project is fresh or broken: `node Web_Toolkit/project_init/bin/project-init.mjs audit --project-root <path>`
4. If unclear phase: `node Web_Toolkit/toolkit_report/bin/toolkit-report.mjs generate --project-root <path>`

### 3. Build and static gates

```powershell
npm run check   # or astro check, if present
npm run build
node Web_Toolkit/stylesheet_check/bin/stylesheet-check.mjs scan --root <project>   # when CSS changed
```

Regenerate **custom** discovery artifacts (robots, sitemap, llms, humans, security.txt, content/search APIs) — never Astro sitemap/robots integrations.

### 4. Discovery verification

```powershell
node Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs ./dist
# After production deploy — same against live URL
```

### 5. Cloudflare / deploy (dry-run first)

```powershell
node Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs permissions audit --site-profile <profile>
node Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs site audit --site-profile <profile>
# ... dns, rules, workers — see OPERATIONS.md
# harden/deploy: dry-run, then --apply
```

**Order:** staging/dev → smoke → production → live discovery pass.

### 6. Before sharing toolkit source

```powershell
node Web_Toolkit/toolkit_purge/bin/toolkit-purge.mjs --apply
node Web_Toolkit/privacy_check/bin/privacy-check.mjs scan --root Web_Toolkit
node Web_Toolkit/toolkit_verify/bin/toolkit-verify.mjs
```

## Hard rules

| Rule | Detail |
|------|--------|
| No generic AGENT.md | Use repo `AGENTS.md` + `OPERATIONS.md` |
| Custom discovery only | No `@astrojs/sitemap` / `@astrojs/robots` |
| Dry-run mutations | cf-agent, registrar, cache purge, zone harden |
| Brand continuity | Read client `BRAND_GUIDE.md` before visual/copy work |
| Styles external | Tokens in `src/styles/tokens.css`; ≤~500 lines per sheet |

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "Skip staging" | Staging → smoke → prod is default unless user waives |
| "Astro sitemap is fine" | Violates toolkit contract; use discovery templates |
| "Secrets in toolkit .env" | Use target project `.env` only |
| "One cf-agent apply without audit" | Always audit/dry-run first |

## Verification

- [ ] Site profile honored (domain, deploy target, branding)
- [ ] `discovery-doctor` passes pre-deploy on `dist/`
- [ ] Smoke tools clean on staging before prod
- [ ] Live discovery pass after production deploy
- [ ] No credentials in export or git

## Install this skill

```powershell
pwsh -File "$env:USERPROFILE\.cursor\scripts\install-cursor-skills.ps1" `
  -LocalPath "C:\Users\Roy\Desktop\AI\WebDesign\Portable_Web_toolkit"
```

Full agent rules: repo `AGENTS.md`. Canonical ops: `Web_Toolkit/OPERATIONS.md`.
