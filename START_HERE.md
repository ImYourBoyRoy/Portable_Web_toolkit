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
# Link required skills into project scope (.agents/skills/)
node ./scripts/manage-project-skills.mjs link --project <client-site-dir>

# Check status
node ./scripts/manage-project-skills.mjs status --project <client-site-dir>
```

Core skills:

- `portable-web-toolkit`
- `site-readiness`
- `site-starter`
- `toolkit-update`

Optional skills:

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
fixes. Readiness does not authorize dependency installation, toolkit updates,
infrastructure mutation, or deployment.

## 4. Route narrowly

```text
New managed site?       → site-starter
State uncertain?        → site-readiness
Deploy or Cloudflare?   → portable-web-toolkit
Accessibility evidence? → Web_Toolkit/wcag_auditor (bundled; never AI/)
Instagram fallback?     → instagram-clone
SVG recovery candidate? → vectorize-pipeline
Toolkit freshness?      → toolkit-update
Live failure?           → site-doctor CLI
```

Use the existing project profile and package scripts. Audit and dry-run
infrastructure changes before an authorized apply. Require separate production
authorization.

## 5. Separate maintenance

Toolkit updates, skill distribution, host setup, and toolkit publication are
separate tasks. Do not run them at the beginning of every site session.

- Updates: use `toolkit-update` for comparison before mutation.
- Host setup: inspect setup manifests and obtain authorization before system or
  privileged changes.
- Publication: require an intended release, source commit, validation, privacy
  scan, and checksum sidecar.

See `skills/portable-web-toolkit/references/maintenance.md` only when one of
these maintenance tasks is actually requested.
