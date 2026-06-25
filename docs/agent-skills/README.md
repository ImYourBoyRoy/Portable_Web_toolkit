# Agent skills — portable-web-toolkit

Install structured agent workflows for **portable-web-toolkit** across mainstream coding agents (Cursor, Claude Code, Gemini CLI, Antigravity, GitHub Copilot, Windsurf, OpenCode, Kiro).

**Start here:** [getting-started.md](./getting-started.md)

## Tell your agent (copy-paste)

```text
Install the Portable Web Toolkit agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit for all future sessions (user/global scope). Use those skills for Astro + Cloudflare site work.
```

## Optional: install yourself

```bash
git clone --depth 1 https://github.com/imyourboyroy/Portable_Web_toolkit.git
cd Portable_Web_toolkit
node ./scripts/install-agent-skills.mjs
```

## Platform wrappers (optional)

| OS | Command |
|----|---------|
| Windows | `pwsh ./scripts/install-agent-skills.ps1 -Agent all` |
| macOS / Linux | `bash ./scripts/install-agent-skills.sh --agent all` |

### Project-scoped (single repo)

Install skills into the **current project** (`.cursor/skills`, `.github/skills`, etc.):

```powershell
./scripts/install-agent-skills.ps1 -Agent cursor -Scope project
```

```bash
./scripts/install-agent-skills.sh --agent cursor --scope project
```

## Skills included

| Skill | Purpose |
|-------|---------|
| `portable-web-toolkit` | **Master** — deploy, discovery, cf-agent, full CLI reference |
| `site-readiness` | **Start every client session** — run-all + next steps |
| `site-starter` | New client site from `site-starter/` templates |
| `toolkit-update` | `git pull` + reinstall skills + verify |
| `instagram-clone` | Public Instagram gallery (env-driven handle) |

**Zero-research:** repo root [`START_HERE.md`](../START_HERE.md)

Read `AGENTS.md` and `Web_Toolkit/OPERATIONS.md`. Always pass `--site-profile` for client sites.

## Per-agent guides

| Agent | Guide |
|-------|-------|
| Cursor | [cursor.md](./cursor.md) |
| Claude Code | [claude-code.md](./claude-code.md) |
| Gemini CLI | [gemini-cli.md](./gemini-cli.md) |
| Antigravity CLI | [antigravity.md](./antigravity.md) |
| GitHub Copilot | [copilot.md](./copilot.md) |
| Windsurf | [windsurf.md](./windsurf.md) |
| OpenCode | [opencode.md](./opencode.md) |
| Kiro | [kiro.md](./kiro.md) |

## Update

```bash
node ./scripts/update-toolkit.mjs
```

Or:

```bash
git pull
node ./scripts/install-agent-skills.mjs
```

## Repo layout

```text
skills/portable-web-toolkit/SKILL.md   # Master skill — load if only one
skills/site-readiness/SKILL.md         # Run-all first on client sites
skills/site-starter/SKILL.md           # New client site scaffold
skills/toolkit-update/SKILL.md         # Pull + reinstall skills
skills/instagram-clone/SKILL.md        # Public Instagram gallery
skills/README.md                       # Skill index
START_HERE.md                          # Zero-research entry (repo root)
AGENTS.md                              # Repo agent rules
```

