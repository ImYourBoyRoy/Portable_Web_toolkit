# OpenCode

OpenCode uses **agent-driven** skill execution via `AGENTS.md` and the built-in `skill` tool.

## Install

1. Clone or open the repo as your workspace:

```bash
git clone https://github.com/imyourboyroy/Portable_Web_toolkit.git
```

2. Ensure present:

- `AGENTS.md` (root)
- `skills/portable-web-toolkit/SKILL.md`

No separate install step — the agent discovers skills from the workspace.

## Agent prompt

```text
Use the portable-web-toolkit workspace skills from https://github.com/imyourboyroy/Portable_Web_toolkit — read AGENTS.md and invoke the portable-web-toolkit skill when operating the portable web toolkit
```

## Expected behavior

- Astro/Cloudflare client site tasks → load `portable-web-toolkit` skill
- Follow OPERATIONS.md sequence before ad-hoc cf-agent calls

## MCP

Load site profile in OpenCode MCP config when available.

