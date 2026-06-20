# Windsurf

Windsurf uses `.windsurfrules` or global rules — not a native skills folder.

## Project rules

```bash
cat skills/portable-web-toolkit/SKILL.md > .windsurfrules
```

Add `AGENTS.md` summaries if you need Rust development rules in the same project.

## Global rules

Windsurf → Settings → AI → Global Rules → paste `skills/portable-web-toolkit/SKILL.md` (keep concise).

## Agent prompt

```text
Add the portable-web-toolkit skill from https://github.com/imyourboyroy/Portable_Web_toolkit to .windsurfrules for this project
```

## Tip

Keep 1–2 skills in `.windsurfrules`; paste OPERATIONS.md steps when debugging deploys.

