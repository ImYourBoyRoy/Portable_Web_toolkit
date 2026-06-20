# Portable Toolkit Architecture

## Why it is shaped this way

The toolkit is split so one project/client cannot quietly contaminate the shared core.

## Shape

### Canonical docs
- `README.md`
- `AGENTS.md`
- `OPERATIONS.md`
- `ARCHITECTURE.md`
- `RUNBOOKS.md`
- `CHECKLIST.md`
- `MEMORY.md`

### Config
- `site-profiles/*.json`
- project root `.env` preferred for live settings
- `Web_Toolkit/.env.example` as a reference template only

### Shared logic
- `shared/lib/`
- centralizes env parsing, profile loading, relative project-root resolution, and runtime-path handling

### Tools
- each tool lives in its own folder
- `project_init/` covers fresh-project bootstrap without overwriting existing work
- `toolkit_verify/` proves the portable toolkit still works
- `toolkit_report/` summarizes what is ready, missing, or pending for a target project
- `registrar/` manages NS delegation at the domain registrar (Porkbun) to point domains at Cloudflare
- shared helpers should be preferred over copy-pasted path/env/profile logic

### Runtime state
- `Web_Toolkit/.runtime/`
- exports, reports, sessions, and other deletable portable-generated artifacts belong here

## How to extend it safely

1. add or reuse a focused tool folder
2. use `shared/lib/` when the logic is cross-tool
3. keep site-specific values in profiles
4. keep runtime residue out of the source tree
5. update canonical docs in the same work cycle



## Input / Output Boundaries

### Inputs
- Site profiles are declarative JSON and should not contain secrets.
- Target project `.env` files are the preferred live secret/config source.
- CLI flags override profile/default values for one-off agent runs.

### Outputs
- Project-specific diagnostics belong in `<projectRoot>/output/`.
- Toolkit self-reports, exports, auth-session metadata, and non-project operational reports belong in `Web_Toolkit/.runtime/`.
- Tool-folder `output/` and `dist/` directories are treated as generated residue and are purged/export-excluded.
- Published source should include only public example profiles; private profiles live outside the repository and are passed by path.

## MCP Packaging Decision

The CLI remains the canonical execution layer. A local MCP should wrap these commands first because it can safely reach local project files, local env, and local browser tooling. A Cloudflare-hosted MCP is best as a second layer for read-only summaries, Cloudflare audits, and report retrieval, with explicit authentication and apply gates for any mutation.
