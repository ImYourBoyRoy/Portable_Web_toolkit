# Cursor

## Install

```powershell
# Windows
./scripts/install-agent-skills.ps1 -Agent cursor
```

```bash
# macOS / Linux
./scripts/install-agent-skills.sh --agent cursor
```

Skills copy to:

- **User (default):** `~/.cursor/skills/<skill-name>/SKILL.md`
- **Project:** `.cursor/skills/` in the current directory (`-Scope project`)

## Agent prompt

```text
Install the agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit
```

## MCP (recommended)

Load site profile and read OPERATIONS.md in Cursor MCP settings:

```powershell
node Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs --help
```

Then say: **Follow the portable-web-toolkit skill** when deploying or auditing Astro sites on Cloudflare.

## Update

Re-run the install script after `git pull`.

