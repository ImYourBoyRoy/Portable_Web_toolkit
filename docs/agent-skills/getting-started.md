# Getting started with agent skills

Each toolkit repo ships a **`skills/`** folder with structured workflows agents follow instead of guessing CLI/API behavior.

## Supported agents

| Agent | Install method |
|-------|----------------|
| **Cursor** | Copy to `~/.cursor/skills/` or project `.cursor/skills/` |
| **Claude Code** | Plugin marketplace or `claude --plugin-dir` |
| **Gemini CLI** | `gemini skills install <repo-url> --path skills` |
| **Antigravity CLI** | `agy plugin install <repo-path-or-url>` |
| **GitHub Copilot** | Project `.github/skills/` (project scope) |
| **Kiro** | `~/.kiro/skills/` or project `.kiro/skills/` |
| **Windsurf** | `.windsurfrules` or Global Rules (paste skill content) |
| **OpenCode** | Workspace `AGENTS.md` + `skills/` |

Read [INSTALL_PROTOCOL.md](./INSTALL_PROTOCOL.md) before changing a discovery
directory. Optional helpers report status:

| Method | Command |
|--------|---------|
| Any OS | `node ./scripts/check-agent-skills.mjs --agent cursor` |
| PowerShell 7+ | `./scripts/install-agent-skills.ps1 -Agent cursor` |
| bash | `./scripts/install-agent-skills.sh --agent cursor` |

See also [`CROSS_PLATFORM.md`](./CROSS_PLATFORM.md).

## Tell your agent (copy-paste)

```text
Inspect the selected Portable Web Toolkit skills from GitHub, compare them with
this client's installed copies, and report conflicts before installing. Use the
repository manifest, preserve displaced content, and install only the approved
client, scope, and skill set.
```

The agent performs the documented protocol directly. The status helper is
optional and never installs.

## Optional: inspect skills yourself

```bash
git clone --depth 1 https://github.com/imyourboyroy/Portable_Web_toolkit.git
cd Portable_Web_toolkit
node ./scripts/check-agent-skills.mjs --agent cursor
```

## Project-scoped status

Run from a **client project root** to inspect that repo without changing it:

```powershell
/path/to/toolkit/scripts/install-agent-skills.ps1 -Agent cursor -Scope project
```

```bash
/path/to/toolkit/scripts/install-agent-skills.sh --agent copilot --scope project
```

## After install

- Invoke by name: `portable-web-toolkit`, `site-readiness`, `site-starter`, `toolkit-update`, `instagram-clone`
- Blind agents: repo **`START_HERE.md`** at root
- Read repo **`AGENTS.md`** when editing toolkit source
- Per-agent details: see the other guides in this folder

## Update

Use `toolkit-update` for comparison and staged reconciliation. Source updates
never imply skill reinstallation.
