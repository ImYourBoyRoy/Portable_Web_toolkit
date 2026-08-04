# Portable Web Toolkit — Agent Instructions

**Blind agents: read [`START_HERE.md`](./START_HERE.md) first — zero research required.**

Repo-local rules for AI agents using the **Portable Astro + Cloudflare Web Toolkit** (`Web_Toolkit/`).

## Read first (in order)

1. The active client repository's applicable instructions when operating on a
   client site
2. **[`START_HERE.md`](./START_HERE.md)** for toolkit orientation
3. The narrow installed skill in `skills/`
4. `Web_Toolkit/OPERATIONS.md` only when detailed operations are relevant
5. Current source, manifests, profiles, tests, and runtime evidence

**Do not** load `docs/templates/AGENT.template.md` for toolkit work — that template is for other projects.

## Toolkit root

All operator modules live under:

```
Web_Toolkit/
```

Site-specific behavior comes from **`site-profiles/*.json`** (or a private profile path passed with `--site-profile`). Live secrets belong in the **target project root `.env`**, not in the toolkit tree.

## Authority and precedence

Follow the host's actual system, administrator, user, repository, and nested
instruction precedence.

When operating on a client site:

1. client-repository instructions and approved runbooks govern that site
2. current source, manifests, tests, and runtime evidence establish state
3. Portable Web Toolkit skills supply subordinate domain procedures
4. toolkit documentation supplies conditional reference material

This file governs work on the toolkit repository itself. It does not outrank a
client repository merely because `Web_Toolkit` is linked into that project.

Configuration has scoped authority, not instruction precedence:

- a site profile owns its declared deployment configuration
- a Brand Guide owns approved visual identity and voice
- `.env` supplies local values and bindings
- manifests and lockfiles own package state

None of these override safety policy or explicit repository constraints.

## Core rules

- **Spec-driven:** read the site profile before deploy, DNS, or branding changes.
- **Dry-run first:** infrastructure and Cloudflare mutations → audit → dry-run → `--apply`.
- **Runtime artifacts:** keep generated output in `Web_Toolkit/.runtime/`, not in publishable source.
- **Discovery layer:** use the established toolkit generators and
  `discovery-doctor` when the client repository adopts that contract. Do not
  create a parallel generator.
- **Styles:** external CSS in `src/styles/` with tokens; run `stylesheet-check scan --root <project>` when changing UI CSS.
- **Accessibility:** toolkit sites use `Web_Toolkit/wcag_auditor` (bridge). Core engine is standalone `@roydawsoniv/wcag-auditor` at `AI/wcag-auditor`. Apps should call the standalone package directly. Evidence gate — not a conformance certificate.
- **Assets:** no stock/placeholder favicons or heroes; WebP for raster; SVG masters for icons/logos.
- **Workers-over-external:** prefer Cloudflare Workers/bindings (KV, D1, R2, Vectorize) before adding SaaS.
- **Version truth:** verify Astro/Wrangler/Node from repo + registry — never trust stale model memory.

## Canonical sequence (summary)

For material work without current readiness evidence, start with:

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
| WCAG auditor (site bridge) | `Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs` → core `@roydawsoniv/wcag-auditor` |
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
- [ ] Client project `MEMORY.md` updated when versions/deploy change (when applicable)

## Skill distribution

See [docs/agent-skills/README.md](./docs/agent-skills/README.md)

```text
Inspect and install the selected Portable Web Toolkit skills from the repository
manifest. Check existing client skill directories first, preserve conflicts,
and change only explicitly selected clients and skills.
```

**Core:** `portable-web-toolkit`, `site-readiness`, `site-starter`,
`toolkit-update`

**Optional:** `instagram-clone`, `vectorize-pipeline`

Optional helper scripts default to status. Agent-driven installation remains
the primary path.
