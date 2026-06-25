# Contributing agent skills

Skills in this folder install to Cursor, Claude Code, Copilot, Gemini CLI, and other agents via `scripts/install-agent-skills.mjs`.

## Add or update a skill

1. Create or edit `skills/<skill-name>/SKILL.md`
2. Frontmatter (required):

```yaml
---
name: my-skill-name
description: One sentence — when an agent should load this skill.
---
```

3. Keep skills **focused** — one job per skill. Route broad work through `portable-web-toolkit`.
4. Use **copy-paste commands** with real paths (`./Web_Toolkit/.../bin/...mjs`).
5. Reinstall after changes:

```bash
node ./scripts/install-agent-skills.mjs
```

6. Bump `VERSION` and note the skill change in `CHANGELOG.md` when publishing.

## When to extend the master skill vs add a skill

| Situation | Action |
|-----------|--------|
| New CLI module every agent should know | Add row to `portable-web-toolkit/SKILL.md` CLI table |
| New workflow (e.g. Instagram gallery) | New skill folder + row in `skills/README.md` |
| One-off client rule | Client `AGENTS.md` / site profile — not toolkit skills |

## Cross-platform notes

See [`CROSS_PLATFORM.md`](./CROSS_PLATFORM.md). Prefer Node `.mjs` entry points over shell-only scripts in skill examples.

## Verification

```bash
node ./scripts/check-toolkit-update.mjs
node ./Web_Toolkit/toolkit_verify/bin/toolkit-verify.mjs
```

After install, confirm skills appear under the agent's skills directory (e.g. `~/.cursor/skills/<name>/`).
