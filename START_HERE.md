# START HERE — AI agents

**Purpose:** Operate toolkit-managed Astro and Cloudflare client sites through
their established project contracts and deterministic tools.

## 1. Confirm the active project

Distinguish:

| Location | Role |
|---|---|
| Portable Web Toolkit repository | CLIs, skills, templates, and maintenance |
| Client repository | Site source, package state, instructions, profile, brand, and environment |

Read the client repository's applicable instructions before toolkit guidance.
Confirm toolkit management through repository instructions, package scripts, a
compatible site profile, or explicit user direction. A `Web_Toolkit` folder
alone may be stale and is not sufficient proof.

## 2. Inspect and link skills into project scope

The agent should:

1. read `docs/agent-skills/SKILL_INDEX.md` and `skill-pack.json`
2. locate the project discovery root (`.agents/skills/`)
3. compare existing skill names, versions, and symlinks
4. link required skills into `<project>/.agents/skills/` via symlinks
5. preserve displaced content outside skill-discovery directories

Project symlink helper:

```bash
# Default link = light router only (install_by_default)
node ./scripts/manage-project-skills.mjs link --project <client-site-dir>

# Explicit skills for active website work / onboarding / maintenance
node ./scripts/manage-project-skills.mjs link --project <client-site-dir> \
  --skills site-onboarding,portable-web-toolkit,site-readiness,site-starter,site-maintenance,wcag-auditor,pagespeed-diagnostics,discovery-doctor,toolkit-update

# Check status
node ./scripts/manage-project-skills.mjs status --project <client-site-dir>
```

Core skills:

- `portable-web-toolkit-router` (global default)
- `site-onboarding` (staged hand-holding — see `docs/agent-skills/ONBOARDING_STAGES.md`)
- `portable-web-toolkit`
- `site-readiness`
- `site-starter`
- `site-maintenance`
- `wcag-auditor`
- `pagespeed-diagnostics`
- `discovery-doctor`
- `toolkit-update`

Optional skills:

- `brand-doctor`
- `image-pipeline`
- `instagram-clone`
- `vectorize-pipeline`

## 3. Establish readiness

For material client-site work without current evidence:

```bash
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run \
  --project-root . \
  --site-profile ./<site>.site-profile.json
```

Use `--skip-network` when required. Read the structured report before choosing
fixes. Readiness does not authorize dependency installation, manual toolkit
reconciliation, infrastructure mutation, or deployment. The guarded automatic
freshness preflight is separate and may run before the command.

## 4. Route narrowly

```text
New machine / Cloudflare beginner? → site-onboarding (ONBOARDING_STAGES S0–S9)
New managed site?       → site-onboarding or site-starter (ask Workers vs Pages/static first)
State uncertain?        → site-readiness
Deploy or Cloudflare?   → portable-web-toolkit
Accessibility evidence? → wcag-auditor skill → Web_Toolkit/wcag_auditor wrapper (engine: node_modules/@imyourboyroy/wcagate; never AI/)
PageSpeed Insights?     → pagespeed-diagnostics
Discovery layer?        → discovery-doctor
Maintenance day?        → site-maintenance (HOW_TO.md loop)
Brand / OG / favicons?  → brand-doctor
Raster → WebP?          → image-pipeline
Instagram fallback?     → instagram-clone
SVG recovery candidate? → vectorize-pipeline
Toolkit freshness?      → toolkit-update
Live failure?           → site-doctor CLI
```

For a **new site**, follow `docs/agent-skills/ONBOARDING_STAGES.md` and always ask
whether they want **Cloudflare Workers** (SSR/API/forms/bindings) or
**Cloudflare Pages static**, then use the matching `site-starter` templates and
`site-starter/.env.example`.

Use the existing project profile and package scripts. Audit and dry-run
infrastructure changes before an authorized apply. Require separate production
authorization.

## 5. Automatic freshness and separate maintenance

Toolkit commands run a throttled freshness preflight by default (once every
24 hours). It checks the public toolkit and WCAGate repositories, fast-forwards
the toolkit only when the checkout is a clean `main` tracking `origin/main`,
and refreshes the unpinned WCAGate Git dependency when its public `main` head
changes. The result is printed to the agent and stored under
`Web_Toolkit/.runtime/toolkit-auto-update.json`.

Dirty worktrees, feature branches, exported folders, unmanaged repositories,
and network failures are preserved and reported rather than overwritten.
Set `PORTABLE_TOOLKIT_AUTO_UPDATE=0` to disable it, or use
`PORTABLE_TOOLKIT_UPDATE_INTERVAL_HOURS` to change the check interval.

- Manual status/reconciliation: use `toolkit-update` when source changes need review.
- Host setup: inspect setup manifests and obtain authorization before system or
  privileged changes.
- Publication: require an intended release, source commit, validation, privacy
  scan, and checksum sidecar.

See `skills/portable-web-toolkit/references/maintenance.md` only when one of
these maintenance tasks is actually requested.
