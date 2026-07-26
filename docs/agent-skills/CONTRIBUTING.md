# Contributing agent skills

Skills are distributed through [`INSTALL_PROTOCOL.md`](./INSTALL_PROTOCOL.md).
Optional scripts report status only.

## Add or update a skill

1. Create or edit `skills/<skill-name>/SKILL.md`, `skill.json`, and
   `agents/openai.yaml`.
2. Keep frontmatter to `name` and a discriminative `description`.
3. Keep each skill focused; route broad toolkit work through
   `portable-web-toolkit`.
4. Add positive and near-miss prompts to `tests/activation-cases.json`.
5. Update the matching semantic version in `skill.json` and
   `skill-pack.json`.
6. Refresh content hashes and validate:

```bash
node ./scripts/update-skill-hashes.mjs
node ./scripts/validate-skills.mjs
node --test ./tests/skill-governance.test.mjs
```

7. Bump the toolkit package version and update `CHANGELOG.md` only when
   publishing a toolkit release.

## Choose the right home

| Situation | Action |
|---|---|
| New CLI module every agent should know | Update the conditional operations reference |
| New focused workflow | Add a skill folder and a `skill-pack.json` entry |
| One-off client rule | Use client instructions or site profile, not toolkit skills |

Prefer portable Node entrypoints in examples. See
[`CROSS_PLATFORM.md`](./CROSS_PLATFORM.md).

After an authorized install, runtime-test explicit invocation and one adjacent
near miss in the selected client.
