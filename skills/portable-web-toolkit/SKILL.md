---
name: portable-web-toolkit
description: Coordinate multi-capability work, deployment or release sequencing, and ambiguous operations in Astro and Cloudflare projects managed by Portable Web Toolkit. Use when the task crosses toolkit owners or needs routing and safety gates. Defer directly to a narrow skill when readiness, scaffolding, updating, Instagram fallback, or vectorization clearly owns the request. Do not use for unrelated or merely generic web work.
---

# Portable Web Toolkit

Use the project contract and deterministic toolkit commands without creating a
parallel workflow.

If one narrow skill clearly owns the request, use it directly and do not load
this router merely because toolkit management is established.

## Confirm toolkit management

Require at least one authoritative signal:

- repository instructions establish Portable Web Toolkit
- package scripts invoke `Web_Toolkit` commands
- a compatible toolkit site profile governs the site
- an established `Web_Toolkit` link is corroborated by configuration or docs
- the user explicitly selects the toolkit

A folder name alone is not proof. If management is uncertain, inspect and
report the evidence before imposing toolkit conventions.

Read [project contract](references/project-contract.md) whenever instructions,
profiles, brand guidance, environment values, or generic skills may conflict.

## Establish current state

1. Resolve the active client repository and applicable instructions.
2. Preserve unrelated and uncommitted work.
3. Locate the toolkit source, site profile, package manager, and supported
   project commands.
4. Run `site-readiness` when beginning material site work, after scaffolding,
   before release preparation, or when project state is uncertain.
5. Read its structured report before choosing fixes.

Use `--skip-network` when policy or environment disallows external checks.
Readiness findings do not authorize dependency installation, infrastructure
mutation, deployment, or toolkit updates.

## Route to the narrow owner

| Need | Owner |
|---|---|
| New toolkit-managed site | `site-starter` |
| Project readiness and next actions | `site-readiness` |
| Public Instagram fallback | `instagram-clone` |
| Wordmark or raster-to-SVG candidate | `vectorize-pipeline` |
| Toolkit and skill version comparison | `toolkit-update` |
| Existing deterministic operation | Relevant `Web_Toolkit` CLI |

Read [operations routing](references/operations.md) only after the task and
deployment target are known.

## Preserve mutation boundaries

- Use repository-approved package, build, and deploy commands.
- Audit and dry-run Cloudflare, DNS, cache, registrar, header, and hardening
  changes before an authorized apply.
- Treat staging and production as separate authorization boundaries.
- Keep secrets out of command output, committed files, profiles, and reports.
- Do not install host software, update the toolkit, reinstall skills, deploy,
  publish, or release merely because ordinary site work was requested.
- Stop on unexplained profile conflicts, destructive generated-file churn, or
  incompatible toolkit versions.

## Complete with evidence

Report the management evidence, project authority followed, readiness state,
toolkit commands used, files and environments changed, dry-run and live
evidence, warnings, skipped checks, rollback path, and unresolved uncertainty.

Read [toolkit maintenance](references/maintenance.md) only for toolkit updates,
host setup, skill distribution, or toolkit publication.
