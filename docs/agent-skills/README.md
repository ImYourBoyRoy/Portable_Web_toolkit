# Agent skills — portable-web-toolkit

Inspect and selectively install structured Portable Web Toolkit workflows across
supported coding agents.

**Start here:** [getting-started.md](./getting-started.md)

## Tell your agent (copy-paste)

```text
Inspect the Portable Web Toolkit skill manifest from its GitHub repository.
Compare the selected skills with this client's documented discovery root,
report existing or modified copies, and install only the missing or explicitly
approved updates. Preserve displaced content outside skill-discovery folders.
```

Follow [INSTALL_PROTOCOL.md](./INSTALL_PROTOCOL.md). An AI agent can perform the
protocol with ordinary Git and filesystem tools.

## Optional status helper

```bash
git clone --depth 1 https://github.com/imyourboyroy/Portable_Web_toolkit.git
cd Portable_Web_toolkit
node ./scripts/check-agent-skills.mjs --agent cursor --scope user
```

Compatibility wrappers are read-only and call the same status helper:

| OS | Command |
|----|---------|
| Windows | `pwsh ./scripts/install-agent-skills.ps1 -Agent cursor` |
| macOS / Linux | `bash ./scripts/install-agent-skills.sh --agent cursor` |

### Project-scoped (single repo)

Inspect skills in the current project:

```powershell
./scripts/install-agent-skills.ps1 -Agent cursor -Scope project
```

```bash
./scripts/install-agent-skills.sh --agent cursor --scope project
```

## Skills included

| Skill | Purpose |
|-------|---------|
| `portable-web-toolkit-router` | Global light router only |
| `portable-web-toolkit` | Router for toolkit-managed Astro and Cloudflare work |
| `site-onboarding` | Staged S0–S9 hand-holding |
| `site-readiness` | Readiness evidence and next actions |
| `site-starter` | New client site from `site-starter/` templates |
| `site-maintenance` | Healthy upgrade → deploy → purge → warm → PSI loop |
| `wcag-auditor` | Bundled accessibility evidence gate + Playwright |
| `pagespeed-diagnostics` | Google PSI via toolkit CLI |
| `discovery-doctor` | robots/sitemap/llms/JSON-LD verification |
| `toolkit-update` | Read-only comparison and authorized reconciliation |
| `brand-doctor` | Optional brand / favicon / OG assets |
| `image-pipeline` | Optional WebP / media rationalization |
| `instagram-clone` | Optional public Instagram gallery fallback |
| `vectorize-pipeline` | Optional raster or font-outline SVG preparation |

**Zero-research:** repo root [`START_HERE.md`](../../START_HERE.md)

Read `AGENTS.md` and `Web_Toolkit/OPERATIONS.md`. Always pass `--site-profile` for client sites.

## Per-agent guides

| Agent | Guide |
|-------|-------|
| Codex | [codex.md](./codex.md) |
| Cursor | [cursor.md](./cursor.md) |
| Claude Code | [claude-code.md](./claude-code.md) |
| Gemini CLI | [gemini-cli.md](./gemini-cli.md) |
| Antigravity CLI | [antigravity.md](./antigravity.md) |
| GitHub Copilot | [copilot.md](./copilot.md) |
| Windsurf | [windsurf.md](./windsurf.md) |
| OpenCode | [opencode.md](./opencode.md) |
| Kiro | [kiro.md](./kiro.md) |

## Update

Invoke `toolkit-update` to compare source, skills, and local-only capabilities.
Updating toolkit source does not reinstall skills automatically.

## Repo layout

```text
skills/portable-web-toolkit/SKILL.md   # Master skill — load if only one
skills/site-readiness/SKILL.md         # Run-all first on client sites
skills/site-starter/SKILL.md           # New client site scaffold
skills/toolkit-update/SKILL.md         # Compare and reconcile versions
skills/instagram-clone/SKILL.md        # Public Instagram gallery
skills/vectorize-pipeline/SKILL.md      # Optional SVG preparation
skill-pack.json                         # Versions, tiers, and expected inventory
docs/agent-skills/SKILL_PACK.md         # Skill index
START_HERE.md                          # Zero-research entry (repo root)
AGENTS.md                              # Repo agent rules
```
