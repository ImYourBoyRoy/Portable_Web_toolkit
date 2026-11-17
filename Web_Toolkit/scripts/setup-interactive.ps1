# ./Web_Toolkit/scripts/setup-interactive.ps1
<#
.SYNOPSIS
  Local agent environment setup for Windows - pure PowerShell, no Node required.

.DESCRIPTION
  Scans for missing/outdated tools, shows one list, then a single Y (or -Yes/-Agent)
  to continue. bootstrap.ps1 installs tools and triggers UAC when elevation is needed.

.EXAMPLE
  pwsh -File .\Web_Toolkit\scripts\setup-interactive.ps1 -Workspace . -Yes
#>

[CmdletBinding()]
param(
    [string]$Workspace = (Get-Location).Path,
    [Alias('Agent', 'NonInteractive')]
    [switch]$Yes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolkitRoot = Split-Path -Parent $ScriptDir
$RepoRoot = Split-Path -Parent $ToolkitRoot
$ManifestPath = Join-Path $ToolkitRoot 'Setup_agent_environment\config\host-bootstrap.manifest.json'
$BootstrapPs1 = Join-Path $ScriptDir 'bootstrap.ps1'

. (Join-Path $ScriptDir 'lib\host-tools.ps1')
$Manifest = Get-Manifest

function Ask-YesNo([string]$Prompt) {
    while ($true) {
        $answer = Read-Host "$Prompt [Y/n]"
        if ([string]::IsNullOrWhiteSpace($answer)) { return $true }
        switch -Regex ($answer.Trim().ToLowerInvariant()) {
            '^(y|yes)$' { return $true }
            '^(n|no)$' { return $false }
            default { Write-Host '  Please answer Y or n.' }
        }
    }
}

$Workspace = (Resolve-Path -LiteralPath $Workspace).Path
$toolkitVersion = if (Test-Path (Join-Path $RepoRoot 'VERSION')) {
    (Get-Content -LiteralPath (Join-Path $RepoRoot 'VERSION') -Raw).Trim()
} else { 'unknown' }

# --- the setup engine, when present or downloadable for this version; otherwise the scripts below do the work ---
$engine = Find-SetupEngine
if (-not $engine -and $env:TOOLKIT_SETUP_LEGACY -ne '1') { if (Get-SetupEngine $RepoRoot) { $engine = Find-SetupEngine } }
if ($engine) {
    Write-Host ''
    Write-Host "[setup] Using the setup engine: $engine (set TOOLKIT_SETUP_LEGACY=1 for the PowerShell scripts instead)"
    & $engine --toolkit-root $ToolkitRoot --workspace $Workspace plan
    $planJson = (& $engine --toolkit-root $ToolkitRoot --workspace $Workspace plan --json) -join "`n"
    if ($planJson -match '"status": "(missing|outdated)"') {
        if (-not $Yes -and -not (Ask-YesNo 'Press Y to install or update the items above')) { Write-Host '[setup] Cancelled - no changes made.'; exit 0 }
        & $engine --toolkit-root $ToolkitRoot --workspace $Workspace install
        exit $LASTEXITCODE
    }
    Write-Host '[SUCCESS] Nothing to install. Local agent environment is ready.'
    exit 0
}

$nodeMajor = Get-NodeMajor $Manifest
$enchiRequired = Get-ManifestValue $Manifest 'tool.enchi.minimum_version' '0.8.0'
$pnpmRequired = Get-ManifestValue $Manifest 'tool.pnpm.minimum_version' '10.0.0'
$pythonRequired = Get-ManifestValue $Manifest 'tool.python.minimum_version' '3.13.0'

$gaps = New-Object System.Collections.Generic.List[string]
$ok = New-Object System.Collections.Generic.List[string]

Add-EnchiToPath
Add-PnpmToPath

$git = Get-CommandVersion 'git'
if ($git) { [void]$ok.Add("Git - $git") } else { [void]$gaps.Add('Git - not installed') }

# Node: the required major comes from .node-version; the release is whatever nodejs.org lists as latest for that major.
$nodeRaw = Get-CommandVersion 'node'
$nodeVer = if ($nodeRaw) { $nodeRaw -replace '^v', '' } else { '' }
if (Test-NodeNeedsInstall $Manifest) {
    $latest = Resolve-LatestNode $Manifest
    if (-not $nodeVer) { [void]$gaps.Add("Node.js - not installed (latest Node $nodeMajor.x will be installed)") }
    elseif ($latest) { [void]$gaps.Add("Node.js - installed $nodeVer (latest $nodeMajor.x is $($latest.Version))") }
    else { [void]$gaps.Add("Node.js - installed $nodeVer (requires Node $nodeMajor or newer)") }
} else {
    [void]$ok.Add("Node.js - $nodeVer (Node $nodeMajor line)")
}

$pnpmVer = (Get-PnpmVersion) -replace '^.*\s+', ''
if ($pnpmVer -and (Compare-Version $pnpmVer $pnpmRequired) -ge 0) { [void]$ok.Add("pnpm - $pnpmVer") }
elseif ($pnpmVer) { [void]$gaps.Add("pnpm - installed $pnpmVer (requires >= $pnpmRequired)") }
else { [void]$gaps.Add("pnpm - not installed (the toolkit's package manager)") }

$enchiVer = (Get-EnchiVersion) -replace '^.*\s+', ''
if ($enchiVer -and (Compare-Version $enchiVer $enchiRequired) -ge 0) {
    [void]$ok.Add("Enchi - $enchiVer")
} elseif ($enchiVer) {
    [void]$gaps.Add("Enchi - installed $enchiVer (requires >= $enchiRequired; upgrades in place from pyenv-native)")
} else {
    [void]$gaps.Add("Enchi - not installed (requires >= $enchiRequired)")
}

if (Test-EnchiGuiAvailable) {
    [void]$ok.Add('Enchi GUI - present (launch: enchi gui)')
} else {
    [void]$gaps.Add('Enchi GUI - not installed (launch after setup: enchi gui)')
}

# Python/pip count as healthy only when Enchi is available (policy: Enchi-only).
$pyVer = ''
if ($enchiVer) {
    $pyRaw = Get-CommandVersion 'python'
    if (-not $pyRaw) { $pyRaw = Get-CommandVersion 'python3' }
    $pyVer = if ($pyRaw) { ($pyRaw -replace '^Python\s+', '').Trim() } else { '' }
}
if ($enchiVer -and $pyVer -and (Compare-Version $pyVer $pythonRequired) -ge 0) {
    [void]$ok.Add("Python - $pyVer (via Enchi; requires >= $pythonRequired)")
} else {
    [void]$gaps.Add("Python - not installed or not under Enchi (requires >= $pythonRequired)")
}

$pip = if ($enchiVer) { Get-CommandVersion 'pip' } else { '' }
if ($pip) { [void]$ok.Add("pip - $pip") } else { [void]$gaps.Add('pip - not installed under the Enchi workspace venv') }

Write-Host ''
Write-Host '  Portable Web Toolkit - Local Agent Environment'
Write-Host "  Toolkit version: $toolkitVersion"
Write-Host "  Workspace: $Workspace"
Write-Host ''

if ($gaps.Count -eq 0) {
    Write-Host '  All required local agent tools look current:'
    foreach ($line in $ok) { Write-Host "    + $line" }
    Write-Host ''
    Write-Host '[SUCCESS] Nothing to install. Local agent environment is ready.'
    exit 0
}

Write-Host '  The following software is not installed or is outdated:'
Write-Host ''
foreach ($line in $gaps) { Write-Host "    * $line" }
Write-Host ''
if ($ok.Count -gt 0) {
    Write-Host '  Already current:'
    foreach ($line in $ok) { Write-Host "    + $line" }
    Write-Host ''
}
Write-Host '  Setup will install/update the agent baseline (Git, Node, pnpm, Enchi,'
Write-Host '  Enchi GUI, Python workspace venv, pip). Windows may prompt for admin approval.'
Write-Host ''

if (-not $Yes) {
    if (-not (Ask-YesNo 'Press Y to continue setting up the local agent environment')) {
        Write-Host '[setup] Cancelled - no changes made.'
        exit 0
    }
} else {
    Write-Host '[setup] -Yes/-Agent: continuing without confirmation prompt.'
}

if (-not (Test-Path -LiteralPath $BootstrapPs1)) {
    Write-Error "Missing bootstrap: $BootstrapPs1"
    exit 1
}

Write-Host ''
Write-Host '[setup] Starting bootstrap (UAC/admin prompts may appear next)...'
Write-Host ''

$commonArgs = @(
    'prepare-host',
    '--workspace', $Workspace,
    '--allow-installs', 'true',
    '--install-optional-tools', 'false',
    '--install-python-playwright', 'true'
)

$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
$shell = if ($pwsh) { $pwsh.Source } else { 'powershell.exe' }
& $shell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $BootstrapPs1 @commonArgs
$exitCode = $LASTEXITCODE

Write-Host ''
if ($exitCode -eq 0) {
    Write-Host '[SUCCESS] Local agent environment setup completed.'
} else {
    Write-Host '[NOTICE] Setup finished with warnings or errors. See the output above.'
}
Write-Host ''
exit $exitCode
