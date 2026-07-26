# Gemini CLI

## Native installation

Inspect `skill-pack.json` and existing Gemini skills first. Use the native
command only after selecting the intended scope and skills:

```bash
gemini skills install https://github.com/imyourboyroy/Portable_Web_toolkit.git --path skills
```

From a local clone:

```bash
git clone https://github.com/imyourboyroy/Portable_Web_toolkit.git
gemini skills install /path/to/portable-web-toolkit/skills/
```

Workspace-only (project `.gemini/skills/`):

```bash
gemini skills install /path/to/portable-web-toolkit/skills/ --scope workspace
```

Optional status helper:

```bash
./scripts/install-agent-skills.sh --agent gemini
```

## Verify

```
/skills list
```

## Agent prompt

```text
Install the agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit using gemini skills install
```

## Persistent context (optional)

For always-on rules, add `@skills/portable-web-toolkit/SKILL.md` to project `GEMINI.md`. Prefer on-demand skills for most workflows.

## MCP

Configure `cf-agent` in `~/.gemini/config.json` when operating the portable web toolkit from Gemini.
