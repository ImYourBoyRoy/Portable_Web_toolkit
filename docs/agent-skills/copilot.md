# GitHub Copilot

## Project install

From your **project root** (not the portable-web-toolkit repo):

```bash
git clone --depth 1 https://github.com/imyourboyroy/Portable_Web_toolkit.git /tmp/portable-web-toolkit
mkdir -p .github/skills
cp -R /tmp/portable-web-toolkit/skills/* .github/skills/
```

Or from inside a portable-web-toolkit clone:

```powershell
./scripts/install-agent-skills.ps1 -Agent copilot -Scope project
```

```bash
./scripts/install-agent-skills.sh --agent copilot --scope project
```

Copilot discovers skills under `.github/skills/`, `.claude/skills/`, or `.agents/skills/`.

## Agent prompt

```text
Install the portable-web-toolkit agent skills into this project's .github/skills from https://github.com/imyourboyroy/Portable_Web_toolkit
```

## Custom instructions

Summarize key rules in `.github/copilot-instructions.md`:

- Use site profile + dry-run before --apply
- Run discovery-doctor on ./dist when deploy or discovery checks fail
- Windows: PowerShell 7+, shell init via `project-init audit`

Full workflow: `skills/portable-web-toolkit/SKILL.md`

## References

[Creating agent skills for GitHub Copilot](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-skills)

