---
name: toolkit-update
description: Updates the Portable_Web_toolkit repo, reinstalls agent skills for all platforms, and verifies toolkit health. Use when the user asks to pull latest toolkit, refresh skills, or sync after git pull.
---

# Toolkit Update

Cross-platform conventions: `skills/CROSS_PLATFORM.md`

## One command (any OS)

```bash
cd /path/to/Portable_Web_toolkit
node ./scripts/update-toolkit.mjs
```

Platform-specific wrappers (optional):

| OS | Command |
|----|---------|
| **Windows** | `pwsh ./scripts/update-toolkit.ps1` |
| **macOS / Linux** | `bash ./scripts/update-toolkit.sh` |
| **Any (pwsh installed)** | `pwsh ./scripts/update-toolkit.ps1` |

## Steps performed

1. `git pull --ff-only`  
2. `install-agent-skills` (user scope, all agents)  
3. `toolkit_verify` + `privacy_check`  

## Install skills from GitHub URL only

```bash
node ./scripts/install-agent-skills.mjs -- -RepoUrl "https://github.com/imyourboyroy/Portable_Web_toolkit" -Agent all
```

Or:

```bash
bash ./scripts/install-agent-skills.sh --repo-url "https://github.com/imyourboyroy/Portable_Web_toolkit" --agent all
```

## Check for updates (every session)

```bash
node ./scripts/check-toolkit-update.mjs   # exit 2 = update available
node ./scripts/update-toolkit.mjs         # when exit code 2
```

## After update

```bash
cd /path/to/client-site
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root .
```

## User one-liner

```text
Run toolkit-update: pull Portable_Web_toolkit, reinstall all agent skills (user scope), verify toolkit.
```
