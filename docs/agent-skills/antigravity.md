# Antigravity CLI (agy)

## Install

```bash
agy plugin install https://github.com/imyourboyroy/Portable_Web_toolkit.git
```

Local clone:

```bash
git clone https://github.com/imyourboyroy/Portable_Web_toolkit.git
agy plugin install /path/to/portable-web-toolkit
```

Or:

```bash
./scripts/install-agent-skills.sh --agent antigravity
```

## Validate

```bash
agy plugin validate /path/to/portable-web-toolkit
agy plugin list
```

## Agent prompt

```text
Install the agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit as an Antigravity plugin (agy plugin install)
```

## Workspace rules

Copy or symlink `AGENTS.md` into project roots where strict site deploy gate discipline is required.

## MCP

Use `cf-agent` alongside the plugin for structured runtime management.

