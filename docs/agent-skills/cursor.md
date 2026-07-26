# Cursor

## Inspect

```powershell
# Windows
./scripts/install-agent-skills.ps1 -Agent cursor
```

```bash
# macOS / Linux
./scripts/install-agent-skills.sh --agent cursor
```

These commands report status only. Follow `INSTALL_PROTOCOL.md` for an
authorized installation. Cursor discovery roots are:

- **User (default):** `~/.cursor/skills/<skill-name>/SKILL.md`
- **Project:** `.cursor/skills/` in the current directory (`-Scope project`)
- **Shared alternative:** `.agents/skills/` and `~/.agents/skills/`

Inspect both Cursor-specific and shared roots before installing. The status
helper reports both and flags duplicates.

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

Compare source and installed copies before changing either.

Source: [Cursor Agent Skills documentation](https://cursor.com/docs/skills).
