# Claude Code

## Marketplace install (recommended)

In Claude Code:

```text
/plugin marketplace add https://github.com/imyourboyroy/Portable_Web_toolkit.git
/plugin install portable-web-toolkit@portable-web-toolkit
```

If SSH clone fails, use the HTTPS marketplace URL above.

## Local / development

```bash
git clone https://github.com/imyourboyroy/Portable_Web_toolkit.git
claude --plugin-dir /path/to/portable-web-toolkit
```

## Agent prompt

```text
Install the agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit using the Claude Code plugin marketplace or --plugin-dir
```

## Skills location

Plugin metadata: `.claude-plugin/plugin.json`  
Skills: `skills/portable-web-toolkit/SKILL.md`

Also read repo `AGENTS.md` when editing the Web_Toolkit modules.

## MCP

Pass --site-profile from `node Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs --help` to Claude MCP config for structured Python environment tools.

