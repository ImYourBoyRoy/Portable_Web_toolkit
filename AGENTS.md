# Portable Web Toolkit — Agent Instructions

**Blind agents: read [`START_HERE.md`](./START_HERE.md) first — zero research required.**

Repo-local rules for AI agents using the **Portable Astro + Cloudflare Web Toolkit** (`Web_Toolkit/`).

## Read first (in order)

1. **[`START_HERE.md`](./START_HERE.md)** — zero-research bootstrap (skills, layout, first commands)
2. Installed **skills** in `skills/` (especially `portable-web-toolkit`, `site-readiness`)
3. `Web_Toolkit/OPERATIONS.md` — full numbered deploy sequence
4. `Web_Toolkit/README.md` — module phases
5. `Web_Toolkit/MEMORY.md` — recent validated facts only

**Do not** use `Web_Toolkit/AGENT.md` — deprecated.

## Toolkit root

All operator modules live under:

```
Web_Toolkit/
```

Site-specific behavior comes from **`site-profiles/*.json`** (or a private profile path passed with `--site-profile`). Live secrets belong in the **target project root `.env`**, not in the toolkit tree.

## Instruction precedence

1. Explicit user request
2. This `AGENTS.md`
3. `Web_Toolkit/OPERATIONS.md` + active site profile
4. `Web_Toolkit/README.md`, `RUNBOOKS.md`, `CHECKLIST.md`
5. Target client project's `AGENTS.md` / `MEMORY.md` when operating on a site repo

## Core rules

- **Spec-driven:** read the site profile before deploy, DNS, or branding changes.
- **Dry-run first:** infrastructure and Cloudflare mutations → audit → dry-run → `--apply`.
- **Runtime artifacts:** keep generated output in `Web_Toolkit/.runtime/`, not in publishable source.
- **Discovery layer:** custom generators only — **never** `@astrojs/sitemap` or `@astrojs/robots` on client sites. Use `templates/discovery/` and `discovery_doctor`.
- **Styles:** external CSS in `src/styles/` with tokens; run `stylesheet-check scan --root <project>` when changing UI CSS.
- **Assets:** no stock/placeholder favicons or heroes; WebP for raster; SVG masters for icons/logos.
- **Workers-over-external:** prefer Cloudflare Workers/bindings (KV, D1, R2, Vectorize) before adding SaaS.
- **Version truth:** verify Astro/Wrangler/Node from repo + registry — never trust stale model memory.

## Canonical sequence (summary)

**Always start client sites with:**

```powershell
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root <site> --site-profile <profile>
```

See `Web_Toolkit/OPERATIONS.md` for the full numbered list. Short form:

1. `site-readiness run` (or `project-init apply-safe` on fresh folders)
2. `init_site_profile` or load existing profile
3. Build: `npm run check` → `npm run build`
4. `discovery-doctor` on `./dist` before deploy; again on live URL after prod
5. Staging deploy + smoke before production
6. `cf-agent` audits — dry-run hardening first
7. Before sharing toolkit: `toolkit-purge --apply`, `privacy-check`, `toolkit-verify`

## Key CLI entry points

| Module | Binary |
|--------|--------|
| Cloudflare agent | `Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs` |
| Discovery doctor | `Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs` |
| Project init | `Web_Toolkit/project_init/bin/project-init.mjs` |
| Site readiness | `Web_Toolkit/site_readiness/bin/site-readiness.mjs` |
| Toolkit report | `Web_Toolkit/toolkit_report/bin/toolkit-report.mjs` |
| Stylesheet check | `Web_Toolkit/stylesheet_check/bin/stylesheet-check.mjs` |
| Site doctor | `Web_Toolkit/site_doctor/bin/site-doctor.mjs` |

Pass `--site-profile <path>` whenever the target site is not the default example profile.

## Verification before completion

- [ ] Site profile loaded and respected
- [ ] Dry-run outputs reviewed before any `--apply`
- [ ] `discovery-doctor` passes on `dist/` (and live URL if deployed)
- [ ] No secrets in committed files or toolkit export
- [ ] `MEMORY.md` updated with verified version/deploy notes when material

## Cursor skill

See [docs/agent-skills/README.md](./docs/agent-skills/README.md)

```text
Install the agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit for all future sessions (user/global scope). Run scripts/install-agent-skills.ps1 -Agent all or scripts/install-agent-skills.sh --agent all.
```

**Skills:** `portable-web-toolkit` (master), `site-readiness`, `site-starter`, `toolkit-update`, `instagram-clone`

**Update:** `./scripts/update-toolkit.ps1` or `./scripts/update-toolkit.sh`
