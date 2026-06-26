# Portable Toolkit Architecture

## Why it is shaped this way

The toolkit is split so one project/client cannot quietly contaminate the shared core.

## Repository layout

```
Portable_Web_toolkit/          ← distribution repo (skills, docs, site-starter)
  START_HERE.md                ← blind-agent entry (read first)
  AGENTS.md                    ← repo-local agent rules
  skills/                      ← installable agent skills
  site-starter/                ← new client site templates
  scripts/                     ← link-toolkit, update, install-skills

  Web_Toolkit/                 ← all CLIs (link into client projects)
    site_readiness/            ← session orchestrator (JSON next steps)
    shared/lib/                ← env, profile, runtime helpers
    site-profiles/             ← public examples only
    templates/discovery/       ← copy-ready discovery generators
    .runtime/                  ← generated toolkit reports (gitignored)
```

Client sites are **separate folders** with a junction/symlink to `Web_Toolkit/`.

## Canonical docs (committed)

- `README.md`, `OPERATIONS.md`, `ARCHITECTURE.md`, `RUNBOOKS.md`, `CHECKLIST.md`

Operator session notes (`MEMORY.md`, `RED_TEAM_REPORT.md`) are **local-only** and not part of the published toolkit. Client sites maintain their own `MEMORY.md`.

## Agent navigation (compressed)

1. **`START_HERE.md`** — zero research
2. **`site-readiness run`** — JSON report with `nextSteps` / `recommendedFixes`
3. **`portable-web-toolkit` skill** — deploy, discovery, CF audits
4. **`OPERATIONS.md`** — full numbered reference (32 steps)

Do **not** load `docs/templates/AGENT.template.md` for toolkit work — that file is for other projects.

## Shared logic

- `shared/lib/` — env parsing, profile loading, project-root resolution, runtime paths
- Prefer shared helpers over copy-pasted path/env logic in new tools

## Key tools

| Module | Role |
|--------|------|
| `site_readiness/` | Sandbox-aware run-all; primary agent orchestrator |
| `project_init/` | Non-destructive client bootstrap |
| `cloudflare-agent-toolkit/` | CF audit, deploy, DNS, hardening |
| `discovery_doctor/` | robots/sitemap/llms/JSON-LD verification |
| `headers_deploy/` | `public/_headers` scaffold and deploy merge |
| `toolkit_verify/` | Self-validation before publish |
| `privacy_check/` | Secrets scan before export |

## Input / output boundaries

### Inputs

- Site profiles: declarative JSON, no secrets
- Client `.env`: live secrets and API keys
- CLI flags override profile defaults

### Outputs

- Client diagnostics: `<projectRoot>/output/`
- Toolkit self-reports: `Web_Toolkit/.runtime/`
- Published source: public example profiles only; private profiles passed by path

## Extending the toolkit

1. Add a focused folder under `Web_Toolkit/<module>/`
2. Reuse `shared/lib/` for cross-tool logic
3. Register bin in `Web_Toolkit/package.json` if publishable
4. Add row to `skills/portable-web-toolkit/SKILL.md` CLI table
5. Update `OPERATIONS.md` / `README.md` in the same work cycle
6. Run `toolkit_verify` + `privacy_check`

## Extending agent skills

See [`../../skills/CONTRIBUTING.md`](../../skills/CONTRIBUTING.md). New skills = new folder + `install-agent-skills.mjs`.

## MCP direction

CLI + JSON reports remain canonical. A **local MCP** should wrap existing commands first. Cloudflare-hosted MCP later for read-only audits only, with explicit apply gates for mutations.
