---
name: toolkit-update
description: Updates the Portable_Web_toolkit repo, reinstalls agent skills for all platforms, and verifies toolkit health. Use when the user asks to pull latest toolkit, refresh skills, or sync after git pull.
---

# Toolkit Update

## One command

```powershell
cd C:\path\to\Portable_Web_toolkit
./scripts/update-toolkit.ps1
```

```bash
cd /path/to/Portable_Web_toolkit && ./scripts/update-toolkit.sh
```

## Steps performed

1. `git pull --ff-only`  
2. `install-agent-skills -Agent all` (user scope)  
3. `toolkit_verify` + `privacy_check`  

## From GitHub URL only

```powershell
./scripts/install-agent-skills.ps1 -RepoUrl "https://github.com/imyourboyroy/Portable_Web_toolkit" -Agent all
```

## After update

```powershell
cd <client-site>
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root .
```

## User one-liner

```text
Run toolkit-update: pull Portable_Web_toolkit, reinstall all agent skills (user scope), verify toolkit.
```
