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

Cross-platform installers (pick one):

| Method | Command |
|--------|---------|
| **Any OS (recommended)** | `node ./scripts/install-agent-skills.mjs` |
| PowerShell 7+ | `./scripts/install-agent-skills.ps1 -Agent all` |
| bash (macOS/Linux) | `./scripts/install-agent-skills.sh --agent all` |

See also [`skills/CROSS_PLATFORM.md`](../../skills/CROSS_PLATFORM.md).

## Tell your agent (copy-paste)

```text
Install the Portable Web Toolkit agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit for all future sessions (user/global scope). Use those skills for Astro + Cloudflare site work — run site-readiness first on client projects.
```

The agent should install skills itself (`node ./scripts/install-agent-skills.mjs`). Users do not need manual one-shot install flows.

## Optional: install skills yourself

```bash
git clone --depth 1 https://github.com/imyourboyroy/Portable_Web_toolkit.git
cd Portable_Web_toolkit
node ./scripts/install-agent-skills.mjs
```

## Project-scoped install

Run from a **client project root** to install into that repo only:

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

```bash
node ./scripts/update-toolkit.mjs
```

Or platform wrappers:

```bash
pwsh ./scripts/update-toolkit.ps1    # Windows or anywhere with pwsh
bash ./scripts/update-toolkit.sh     # macOS / Linux
```

Or manually:

```bash
git pull
node ./scripts/install-agent-skills.mjs
```
