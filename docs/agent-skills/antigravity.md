# Antigravity IDE and CLI

## Skill discovery

Antigravity IDE:

- user: `~/.gemini/config/skills/<skill-name>/`
- project: `.agents/skills/<skill-name>/`

Antigravity CLI:

- user: `~/.gemini/antigravity-cli/skills/<skill-name>/`
- project: `.agents/skills/<skill-name>/`

Optional read-only comparisons:

```bash
node ./scripts/check-agent-skills.mjs --agent antigravity
node ./scripts/check-agent-skills.mjs --agent antigravity-cli
```

## CLI plugin installation

Inspect the manifest and existing plugins or skills first. Use the native
CLI only after selecting the intended scope:

```bash
agy plugin install https://github.com/imyourboyroy/Portable_Web_toolkit.git
```

Local clone:

```bash
git clone https://github.com/imyourboyroy/Portable_Web_toolkit.git
agy plugin install /path/to/portable-web-toolkit
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

Add repository instructions only when the client project adopts the toolkit;
do not impose toolkit policy on unrelated workspaces.

## MCP

Use `cf-agent` alongside the plugin for structured runtime management.

Sources: [Antigravity IDE skills](https://antigravity.google/docs/skills) and
[Antigravity CLI plugins and skills](https://antigravity.google/docs/cli/plugins).
