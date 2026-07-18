# ./Web_Toolkit/scripts/setup-interactive.ps1
<#
.SYNOPSIS
  Interactive host setup menu for Windows — pure PowerShell, no Node required.

.DESCRIPTION
  Collects opt-in/out choices, then runs bootstrap.ps1 (which can install Node).
  Launchers must call this script instead of setup-interactive.mjs so a fresh
  machine without Node can still provision itself.

.EXAMPLE
  pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\Web_Toolkit\scripts\setup-interactive.ps1 -Workspace .
#>

[CmdletBinding()]
param(
    [string]$Workspace = (Get-Location).Path,
    [switch]$NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolkitRoot = Split-Path -Parent $ScriptDir
$MenuPath = Join-Path $ToolkitRoot 'Setup_agent_environment\config\setup-menu.json'
$BootstrapPs1 = Join-Path $ScriptDir 'bootstrap.ps1'

function Get-MenuString {
    param([string]$Key, [string]$Default = '')
    if (-not (Test-Path -LiteralPath $MenuPath)) { return $Default }
    try {
        $menu = Get-Content -LiteralPath $MenuPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $value = $menu.$Key
        if ([string]::IsNullOrWhiteSpace([string]$value)) { return $Default }
        return [string]$value
    } catch {
        return $Default
    }
}

function Ask-YesNo {
    param(
        [Parameter(Mandatory)][string]$Prompt,
        [bool]$DefaultYes = $true
    )
    $hint = if ($DefaultYes) { 'Y/n' } else { 'y/N' }
    while ($true) {
        $answer = Read-Host "$Prompt [$hint]"
        if ([string]::IsNullOrWhiteSpace($answer)) { return $DefaultYes }
        switch -Regex ($answer.Trim().ToLowerInvariant()) {
            '^(y|yes)$' { return $true }
            '^(n|no)$' { return $false }
            default { Write-Host '  Please answer y or n.' }
        }
    }
}

$Workspace = (Resolve-Path -LiteralPath $Workspace).Path
$Title = Get-MenuString -Key 'title' -Default 'Portable Web Toolkit - Machine Setup'
$Subtitle = Get-MenuString -Key 'subtitle' -Default 'Prepares your computer for Astro + Cloudflare development with AI coding agents.'
$AdminNote = Get-MenuString -Key 'adminNote' -Default 'Installing missing tools may require administrator approval.'
$PyenvBlurb = Get-MenuString -Key 'pyenvNativeBlurb' -Default 'Python is managed exclusively by pyenv-native (pyenv CLI + pyenv-gui via `pyenv gui`).'

$optionalDefs = @(
    @{ Id = 'pnpm'; Name = 'pnpm'; Description = 'Fast Node package manager (optional; npm is included with Node)'; DefaultYes = $false },
    @{ Id = 'bun'; Name = 'Bun'; Description = 'Alternative JavaScript runtime and package manager'; DefaultYes = $false },
    @{ Id = 'uv'; Name = 'uv'; Description = 'Fast Python package installer (complements pyenv-native / pyenv-gui venvs)'; DefaultYes = $false },
    @{ Id = 'gh'; Name = 'GitHub CLI'; Description = 'GitHub from the terminal (repos, PRs, auth)'; DefaultYes = $false },
    @{ Id = 'dotnet'; Name = '.NET SDK'; Description = 'Only if you work on .NET projects alongside web sites'; DefaultYes = $false }
)

Write-Host ''
Write-Host "  $Title"
Write-Host '  ===================================='
Write-Host "  $Subtitle"
Write-Host ''
Write-Host "  $AdminNote"
Write-Host ''
Write-Host '  About Python (pyenv-native + pyenv-gui)'
Write-Host "  $PyenvBlurb"
Write-Host ''
Write-Host '  [required] Core host tools'
Write-Host '             Git, Node.js 26+ (current line), pyenv-native (pyenv CLI) + pyenv-gui, Python 3.14+ workspace venv, and pip'
Write-Host '             (Node is installed by this wizard when missing — you do not need Node beforehand.)'
Write-Host ''

$optionalTools = New-Object System.Collections.Generic.List[string]
$installPlaywright = $false
$skipWorkspaceChecks = $false

if ($NonInteractive) {
    foreach ($item in $optionalDefs) { [void]$optionalTools.Add($item.Id) }
    $installPlaywright = $true
    $skipWorkspaceChecks = $false
} else {
    foreach ($item in $optionalDefs) {
        if (Ask-YesNo -Prompt ("Install {0}? — {1}" -f $item.Name, $item.Description) -DefaultYes:$item.DefaultYes) {
            [void]$optionalTools.Add($item.Id)
        }
    }

    $installPlaywright = Ask-YesNo -Prompt 'Install Python Playwright + Chromium? — Browser automation inside your pyenv-native project venv' -DefaultYes:$false
    $doWorkspaceChecks = Ask-YesNo -Prompt 'Project folder checks? — Verify README, package.json, Astro config, and related files' -DefaultYes:$true
    $skipWorkspaceChecks = -not $doWorkspaceChecks

    Write-Host ''
    Write-Host '  Summary'
    Write-Host '  -------'
    Write-Host '  Core host tools: yes (required; includes Node install when missing)'
    Write-Host ("  Optional tools: {0}" -f $(if ($optionalTools.Count) { ($optionalTools -join ', ') } else { '(none)' }))
    Write-Host ("  Python Playwright: {0}" -f $(if ($installPlaywright) { 'yes' } else { 'no' }))
    Write-Host ("  Workspace checks: {0}" -f $(if ($skipWorkspaceChecks) { 'skipped' } else { 'yes' }))
    Write-Host "  Target workspace: $Workspace"
    Write-Host ''

    if (-not (Ask-YesNo -Prompt 'Proceed with setup? Admin/sudo may be requested next' -DefaultYes:$true)) {
        Write-Host '[setup] Cancelled — no changes made.'
        exit 0
    }
}

if (-not (Test-Path -LiteralPath $BootstrapPs1)) {
    Write-Error "Missing bootstrap: $BootstrapPs1"
    exit 1
}

$commonArgs = @(
    'prepare-host',
    '--workspace', $Workspace,
    '--allow-installs', 'true',
    '--install-optional-tools', $(if ($optionalTools.Count -gt 0) { 'true' } else { 'false' }),
    '--install-python-playwright', $(if ($installPlaywright) { 'true' } else { 'false' })
)

if ($optionalTools.Count -gt 0) {
    $commonArgs += @('--optional-tools', ($optionalTools -join ','))
}
if ($skipWorkspaceChecks) {
    $commonArgs += '--skip-workspace-checks'
}

Write-Host ''
Write-Host '[setup] Starting native bootstrap (Node will be installed if missing)...'
Write-Host ''

$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
$shell = if ($pwsh) { $pwsh.Source } else { 'powershell.exe' }

& $shell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $BootstrapPs1 @commonArgs
$exitCode = $LASTEXITCODE

Write-Host ''
if ($exitCode -eq 0) {
    Write-Host '[SUCCESS] Setup completed.'
} else {
    Write-Host '[NOTICE] Setup finished with warnings or errors. See the output above.'
}
Write-Host ''
exit $exitCode
