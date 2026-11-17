# Portable Web Toolkit — Agent Instructions

**Blind agents: read [`START_HERE.md`](./START_HERE.md) first — zero research required.**

Repo-local rules for AI agents using the **Portable Astro + Cloudflare Web Toolkit** (`Web_Toolkit/`).

## Read first (in order)

0. **[`docs/TOOLS.md`](./docs/TOOLS.md)**: the generated toolkit map (which tool for which task). `toolkit-index find "<task>"` ranks tools for a sentence.

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
  `discovery-doctor` when the client repository adopts that contract. The
  doctor requires the core llms/humans/security/content discovery artifacts by
  default; explicitly relaxed or runtime-only resources are INFO when absent,
  while present-but-invalid resources fail. Do not create a parallel
  generator.
- **Package manager:** pnpm is the default (`pnpm install`, `pnpm run <script>`, `pnpm exec`). A site with an npm/yarn/bun lockfile keeps its manager; `package-updater migrate` converts one on request. npm is only the fallback when pnpm is missing, and the host setup installs pnpm.
- **Python:** Enchi (`enchi`, formerly pyenv-native, `enchi gui` for the dashboard) is the toolkit's Python manager on Windows, macOS and Linux. Use `enchi exec python …`, `enchi venv …` and `enchi doctor` for toolkit Python work, never system, Homebrew or winget Python. A machine that still has the old `pyenv` CLI is upgraded in place by the host setup. Do not impose it on an unrelated client project.
- **Host tools, no pins:** Node is the latest release of the major in the repo-root `.node-version` (a bare major), resolved from nodejs.org at setup time; nothing in the manifests or scripts names a Node, pnpm or Enchi version to install.
- **Host setup:** `toolkit-setup plan --json` (read-only) then `toolkit-setup install [item…]`; read `Web_Toolkit/.runtime/setup/state.json` for per-item results and retry a failed item by name. Administrator rights come only from the OS prompt (UAC, macOS dialog, polkit, or `sudo` in the user's terminal) and one approval covers the session; never ask the user to type a password into chat or a file. When the engine is not installed, `bash ./Setup_Agent_Environment.sh --yes` runs the equivalent scripts.
- **Servers and ports:** never assume a port is free (4321 is often the user's own dev server). Pick one with `dev-ports free --preferred <n>`; servers the toolkit starts are registered and are yours to stop (`dev-ports release --port <n>`, `cleanup`) during tests and when finished. Never stop a process the toolkit did not start: show the user its pid, command and directory (`dev-ports who --port <n>`), and only after their explicit yes pass that exact pid as `--approved-pid`.
- **Styles:** external CSS in `src/styles/` with tokens; run `stylesheet-check scan --root <project>` when changing UI CSS.
- **Accessibility:** toolkit sites use `Web_Toolkit/wcag_auditor` (WCAGate wrapper) only — never resolve `AI/wcag-auditor`. Engine is `github:imyourboyroy/WCAGate` in `Web_Toolkit/node_modules`. Evidence gate — not a conformance certificate.
- **Assets:** no stock/placeholder favicons or heroes; **Astro `Image`/`Picture`** (`astro:assets`, `imageService: 'compile'` on Workers) for content photos — prefer `OptimizedPicture` with AVIF+WebP. **image-pipeline** only for leftover `public/` rasters. SVG masters for icons/logos.
- **Workers-over-external:** prefer Cloudflare Workers/bindings (KV, D1, R2, Vectorize) before adding SaaS.
- **Version truth:** verify Astro/Wrangler/Node from repo + registry — never trust stale model memory.
- **Automatic freshness:** toolkit entrypoints perform a throttled update check; only a clean public `main` checkout may fast-forward, while WCAGate follows the latest published release tag through a semver range (`Web_Toolkit/shared/lib/engine-spec.mjs`, never a pinned version). Dirty or unmanaged state is reported and preserved.
- **Agent CLI contract:** every packaged CLI must use the shared parser/help helpers, document examples, flags, side effects/safety, and exit codes, and offer structured output when agents need to consume findings. `toolkit-verify` checks this contract for every package `bin` entry.

## Canonical sequence (summary)

For material work without current readiness evidence, start with:

```powershell
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root <site> --site-profile <profile>
```

See `Web_Toolkit/OPERATIONS.md` for the full numbered list. Short form:

1. Toolkit freshness preflight (automatic; inspect `.runtime/toolkit-auto-update.json` on warning/error)
2. `site-readiness run` (or `project-init apply-safe` on fresh folders)
3. `init_site_profile` or load existing profile
4. Build: `<pm> run check` → `<pm> run build` (pnpm by default; detected from the lockfile; convert with `package-updater migrate`)
5. `discovery-doctor` on `./dist` before deploy (with `--site-profile` for the
   active discovery contract); again on live URL after prod
6. Staging deploy + smoke before production
7. `cf-agent` audits — dry-run hardening first
8. Before sharing toolkit: `toolkit-purge --apply`, `privacy-check`, `toolkit-verify`

## Key CLI entry points

| Module | Binary |
|--------|--------|
| Cloudflare agent | `Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs` |
| Discovery doctor | `Web_Toolkit/discovery_doctor/bin/discovery-doctor.mjs` |
| WCAG auditor | `Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs` (wrapper; engine in `Web_Toolkit/node_modules/@imyourboyroy/wcagate`) |
| Project init | `Web_Toolkit/project_init/bin/project-init.mjs` |
| Site readiness | `Web_Toolkit/site_readiness/bin/site-readiness.mjs` |
| Toolkit report | `Web_Toolkit/toolkit_report/bin/toolkit-report.mjs` |
| Stylesheet check | `Web_Toolkit/stylesheet_check/bin/stylesheet-check.mjs` |
| Site doctor | `Web_Toolkit/site_doctor/bin/site-doctor.mjs` |
| Dev ports (free port, who owns it, release only ours) | `Web_Toolkit/dev_ports/bin/dev-ports.mjs` |
| Form doctor (contact and intake forms) | `Web_Toolkit/form_doctor/bin/form-doctor.mjs` |
| Site templates (contact, intake, fonts, layout, themes) | `Web_Toolkit/site_templates/bin/site-templates.mjs` |

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

**Core:** `portable-web-toolkit-router` (global default), `site-onboarding`,
`portable-web-toolkit`, `site-readiness`, `site-starter`, `site-maintenance`,
`site-templates`, `wcag-auditor`, `pagespeed-diagnostics`, `discovery-doctor`, `toolkit-update`

**Optional:** `brand-doctor`, `image-pipeline`, `instagram-clone`, `site-theme`,
`vectorize-pipeline`


Optional helper scripts default to status. Agent-driven installation remains
the primary path.
