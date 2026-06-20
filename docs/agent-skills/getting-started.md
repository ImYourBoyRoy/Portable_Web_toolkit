# Getting started with agent skills

Each Roy toolkit repo ships a **`skills/`** folder with structured workflows agents follow instead of guessing CLI/API behavior.

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

Cross-platform installers: `scripts/install-agent-skills.ps1` (Windows/macOS/Linux **PowerShell 7+**) and `scripts/install-agent-skills.sh` (macOS/Linux **bash**).

## Tell your agent (works in any tool)

```text
Install the agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit. Clone the repo, then run scripts/install-agent-skills.ps1 -Agent all on Windows (PowerShell 7+) or scripts/install-agent-skills.sh --agent all on macOS/Linux.
```

## One-shot install (no manual cd)

### Windows (PowerShell 7+)

```powershell
$repo = "https://github.com/imyourboyroy/Portable_Web_toolkit"
$dir = Join-Path $env:TEMP "agent-skills-$(Get-Random)"
git clone --depth 1 $repo $dir
& (Join-Path $dir "scripts/install-agent-skills.ps1") -RepoRoot $dir -Agent all
```

### macOS / Linux (bash)

```bash
repo="https://github.com/imyourboyroy/Portable_Web_toolkit"
dir="$(mktemp -d)"
git clone --depth 1 "$repo" "$dir"
chmod +x "$dir/scripts/install-agent-skills.sh"
"$dir/scripts/install-agent-skills.sh" --repo-root "$dir" --agent all
```

### From GitHub URL only (installer script not on disk yet)

**Windows:**

```powershell
git clone --depth 1 https://github.com/imyourboyroy/Portable_Web_toolkit $env:TEMP\skills-install
pwsh -File "$env:TEMP\skills-install\scripts\install-agent-skills.ps1" -RepoUrl "https://github.com/imyourboyroy/Portable_Web_toolkit" -Agent all
```

**macOS / Linux:**

```bash
git clone --depth 1 https://github.com/imyourboyroy/Portable_Web_toolkit /tmp/skills-install
chmod +x /tmp/skills-install/scripts/install-agent-skills.sh
/tmp/skills-install/scripts/install-agent-skills.sh --repo-url "https://github.com/imyourboyroy/Portable_Web_toolkit" --agent all
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

- Invoke by name: e.g. "Follow the **portable-web-toolkit** skill"
- Read repo **`AGENTS.md`** when editing toolkit source
- Per-agent details: see the other guides in this folder

## Update

```powershell
git pull
./scripts/install-agent-skills.ps1 -Agent all
```

```bash
git pull
./scripts/install-agent-skills.sh --agent all
```
