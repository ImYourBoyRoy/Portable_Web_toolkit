# Getting started with agent skills

**Start here for humans and agents:** the repository root
[`README.md`](../../README.md).

That README owns the copy-paste onboarding prompt. This page covers **skill
install mechanics** only. For checkpoint-driven setup (host tools, Cloudflare
tokens, MCP, Workers vs Pages, site-starter), follow
[`ONBOARDING_STAGES.md`](./ONBOARDING_STAGES.md) via the `site-onboarding` skill.

---

## Tell your agent (copy-paste)

Prefer the full prompt in [`README.md`](../../README.md). Short form:

```text
Follow https://github.com/imyourboyroy/Portable_Web_toolkit — read README.md first,
then docs/agent-skills/ONBOARDING_STAGES.md (skill: site-onboarding).

Run stages S0–S9 with a checkpoint after each stage (use the host question UI when
available). Ask before host bootstrap, Cloudflare API token work, Cloudflare MCP/plugin
install, scaffold writes, and production deploy. Keep global PWT skills light
(portable-web-toolkit-router only).
```

---

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

- Invoke by name: `site-onboarding`, `portable-web-toolkit`, `site-readiness`, `site-starter`, `toolkit-update`, `instagram-clone`
- Blind agents: repo **`START_HERE.md`** at root
- Read repo **`AGENTS.md`** when editing toolkit source
- Per-agent details: see the other guides in this folder

## Update

Use `toolkit-update` for comparison and staged reconciliation. Source updates
never imply skill reinstallation.
