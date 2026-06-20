# ./scripts/install-cursor-skills.ps1
# Deprecated: use install-agent-skills.ps1 (all mainstream agents, all platforms).
pwsh -NoLogo -NoProfile -File (Join-Path $PSScriptRoot 'install-agent-skills.ps1') @args
