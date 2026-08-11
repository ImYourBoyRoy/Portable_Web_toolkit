# Project Init

Non-destructive bootstrap for fresh or partially-built website folders.

## Commands

```bash
node ./Web_Toolkit/project_init/bin/project-init.mjs audit --project-root .
node ./Web_Toolkit/project_init/bin/project-init.mjs apply-safe --project-root . --project-name "My Site"
```

## What `apply-safe` creates (only when missing)

- `README.md`, `MEMORY.md`, `.gitignore`, `.env.example`
- Optional astro-env safe fix when `package.json` exists
- Required agent skill symlinks under `.agents/skills/` via `manage-project-skills.mjs link`

Skill-link failures **exit non-zero** so agents do not proceed with a half-configured skill architecture.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Command completed successfully. |
| `1` | Unhandled failure, astro-env fix failure, or skill-link failure. |
