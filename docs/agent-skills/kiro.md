# Kiro

Kiro supports skills under `.kiro/skills/` (project or global).

## Inspect

```bash
./scripts/install-agent-skills.sh --agent kiro
```

```powershell
./scripts/install-agent-skills.ps1 -Agent kiro
```

The commands above report status only. Follow `INSTALL_PROTOCOL.md` before
copying. Paths:

- **User:** `~/.kiro/skills/`
- **Project:** `.kiro/skills/` (`--scope project`)

## Agent prompt

```text
Install the agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit into Kiro skills (.kiro/skills)
```

## Docs

[Kiro skills documentation](https://kiro.dev/docs/skills/)

Also place `AGENTS.md` in project roots for operator rules.
