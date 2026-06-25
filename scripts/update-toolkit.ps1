# ./scripts/update-toolkit.ps1
<#
.SYNOPSIS
  Pull latest Portable_Web_toolkit, reinstall agent skills, verify toolkit health.

.EXAMPLE
  ./scripts/update-toolkit.ps1
  ./scripts/update-toolkit.ps1 -Agent cursor -Scope user
  ./scripts/update-toolkit.ps1 -SkipGitPull
#>
[CmdletBinding()]
param(
    [ValidateSet('cursor', 'claude', 'gemini', 'antigravity', 'copilot', 'kiro', 'windsurf', 'opencode', 'all')]
    [string]$Agent = 'all',

    [ValidateSet('user', 'project')]
    [string]$Scope = 'user',

    [switch]$SkipGitPull,

    [string]$RepoRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

Write-Host "[update-toolkit] Repo: $RepoRoot"

if (-not $SkipGitPull -and (Test-Path (Join-Path $RepoRoot '.git'))) {
    Write-Host '[update-toolkit] git pull --ff-only'
    git -C $RepoRoot pull --ff-only
}

$installer = Join-Path $RepoRoot 'scripts/install-agent-skills.ps1'
if (-not (Test-Path $installer)) { throw "Missing installer: $installer" }

Write-Host "[update-toolkit] Reinstall skills (Agent=$Agent Scope=$Scope)"
& $installer -RepoRoot $RepoRoot -Agent $Agent -Scope $Scope

$verify = Join-Path $RepoRoot 'Web_Toolkit/toolkit_verify/bin/toolkit-verify.mjs'
$privacy = Join-Path $RepoRoot 'Web_Toolkit/privacy_check/bin/privacy-check.mjs'

Write-Host '[update-toolkit] toolkit-verify'
node $verify
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '[update-toolkit] privacy-check'
node $privacy scan --root (Join-Path $RepoRoot 'Web_Toolkit') --json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '[update-toolkit] Done. Re-run site-readiness on client projects if needed.'
