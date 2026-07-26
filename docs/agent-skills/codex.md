# Codex

## Discovery

Current Codex documentation uses:

- user: `~/.agents/skills/<skill-name>/SKILL.md`
- project: `.agents/skills/<skill-name>/SKILL.md`

The project root is also shared with Cursor and Antigravity. Inspect all
supported roots before creating a duplicate.

Optional read-only status:

```bash
node ./scripts/check-agent-skills.mjs --agent codex --scope user
```

For an authorized copied-skill installation, follow
[`INSTALL_PROTOCOL.md`](./INSTALL_PROTOCOL.md). Codex recommends plugins for
public distribution; treat a future Codex plugin as separate packaging until
its manifest and activation are runtime-tested.

## Verify

Restart Codex if a newly installed skill is not detected, then use `/skills` or
explicitly mention `$portable-web-toolkit`. Test one positive and one near-miss
prompt from `tests/activation-cases.json`.

Source: [OpenAI skill documentation](https://developers.openai.com/codex/skills).
