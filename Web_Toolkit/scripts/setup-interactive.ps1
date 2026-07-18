# ./Web_Toolkit/scripts/setup-interactive.ps1
<#
.SYNOPSIS
  Local agent environment setup for Windows — pure PowerShell, no Node required.

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

function Get-ManifestValue {
    param([string]$Key, [string]$Default = '')
    if (-not (Test-Path -LiteralPath $ManifestPath)) { return $Default }
    $line = Select-String -Path $ManifestPath -Pattern ('"{0}"' -f [regex]::Escape($Key)) | Select-Object -First 1
    if (-not $line) { return $Default }
    if ($line.Line -match ':\s*"([^"]*)"') { return $Matches[1] }
    return $Default
}

function Get-CommandVersion([string]$Name) {
    try {
        $cmd = Get-Command $Name -ErrorAction Stop
        $out = & $cmd.Source --version 2>$null | Select-Object -First 1
        if ($out) { return ([string]$out).Trim() }
        return 'present'
    } catch { return '' }
}

function Compare-Version([string]$Left, [string]$Right) {
    $l = [version](($Left -replace '[^\d.].*', '') -replace '^(\d+\.\d+)$', '$1.0')
    $r = [version](($Right -replace '[^\d.].*', '') -replace '^(\d+\.\d+)$', '$1.0')
    return $l.CompareTo($r)
}

function Get-PyenvVersion {
    $candidates = @(
        (Join-Path $env:USERPROFILE '.pyenv\bin\pyenv.exe'),
        (Join-Path $env:USERPROFILE '.pyenv\pyenv.exe')
    )
    foreach ($path in $candidates) {
        if (Test-Path -LiteralPath $path) {
            try {
                $ver = & $path --version 2>$null | Select-Object -First 1
                if ($ver) { return ([string]$ver).Trim() -replace '^.*\s+', '' }
            } catch {}
        }
    }
    $fromPath = Get-CommandVersion 'pyenv'
    if ($fromPath) { return $fromPath -replace '^.*\s+', '' }
    return ''
}

function Test-PyenvGuiAvailable {
    $gui = Join-Path $env:USERPROFILE '.pyenv\bin\pyenv-gui.exe'
    if (Test-Path -LiteralPath $gui) { return $true }
    try {
        $pyenv = Get-Command pyenv -ErrorAction Stop
        $null = & $pyenv.Source gui --help 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

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

$nodeRequired = Get-ManifestValue 'tool.node.required_version' '26.0.0'
$pyenvRequired = Get-ManifestValue 'tool.pyenv_native.minimum_version' '0.2.30'
$pythonRequired = Get-ManifestValue 'tool.python.minimum_version' '3.13.0'

$gaps = New-Object System.Collections.Generic.List[string]
$ok = New-Object System.Collections.Generic.List[string]

$git = Get-CommandVersion 'git'
if ($git) { [void]$ok.Add("Git — $git") } else { [void]$gaps.Add('Git — not installed') }

$nodeRaw = Get-CommandVersion 'node'
$nodeVer = if ($nodeRaw) { $nodeRaw -replace '^v', '' } else { '' }
if ($nodeVer -and (Compare-Version $nodeVer $nodeRequired) -ge 0) {
    [void]$ok.Add("Node.js — $nodeVer (requires >= $nodeRequired)")
} elseif ($nodeVer) {
    [void]$gaps.Add("Node.js — installed $nodeVer (requires >= $nodeRequired)")
} else {
    [void]$gaps.Add("Node.js — not installed (requires >= $nodeRequired)")
}

$pyenvVer = Get-PyenvVersion
if ($pyenvVer -and (Compare-Version $pyenvVer $pyenvRequired) -ge 0) {
    [void]$ok.Add("pyenv-native (pyenv) — $pyenvVer")
} elseif ($pyenvVer) {
    [void]$gaps.Add("pyenv-native (pyenv) — installed $pyenvVer (requires >= $pyenvRequired)")
} else {
    [void]$gaps.Add("pyenv-native (pyenv) — not installed (requires >= $pyenvRequired)")
}

if (Test-PyenvGuiAvailable) {
    [void]$ok.Add('pyenv-gui — present (launch: pyenv gui)')
} else {
    [void]$gaps.Add('pyenv-gui — not installed (launch after setup: pyenv gui)')
}

# Python/pip count as healthy only when pyenv-native is available (policy: pyenv-native-only).
$pyVer = ''
if ($pyenvVer) {
    $pyRaw = Get-CommandVersion 'python'
    if (-not $pyRaw) { $pyRaw = Get-CommandVersion 'python3' }
    $pyVer = if ($pyRaw) { ($pyRaw -replace '^Python\s+', '').Trim() } else { '' }
}
if ($pyenvVer -and $pyVer -and (Compare-Version $pyVer $pythonRequired) -ge 0) {
    [void]$ok.Add("Python — $pyVer (via pyenv-native; requires >= $pythonRequired)")
} else {
    [void]$gaps.Add("Python — not installed or not under pyenv-native (requires >= $pythonRequired)")
}

$pip = if ($pyenvVer) { Get-CommandVersion 'pip' } else { '' }
if ($pip) { [void]$ok.Add("pip — $pip") } else { [void]$gaps.Add('pip — not installed under pyenv-native workspace venv') }

Write-Host ''
Write-Host '  Portable Web Toolkit — Local Agent Environment'
Write-Host "  Toolkit version: $toolkitVersion"
Write-Host "  Workspace: $Workspace"
Write-Host ''

if ($gaps.Count -eq 0) {
    Write-Host '  All required local agent tools look current:'
    foreach ($line in $ok) { Write-Host "    ✓ $line" }
    Write-Host ''
    Write-Host '[SUCCESS] Nothing to install. Local agent environment is ready.'
    exit 0
}

Write-Host '  The following software is not installed or is outdated:'
Write-Host ''
foreach ($line in $gaps) { Write-Host "    • $line" }
Write-Host ''
if ($ok.Count -gt 0) {
    Write-Host '  Already current:'
    foreach ($line in $ok) { Write-Host "    ✓ $line" }
    Write-Host ''
}
Write-Host '  Setup will install/update the agent baseline (Git, Node, pyenv-native,'
Write-Host '  pyenv-gui, Python workspace venv, pip). Windows may prompt for admin approval.'
Write-Host ''

if (-not $Yes) {
    if (-not (Ask-YesNo 'Press Y to continue setting up the local agent environment')) {
        Write-Host '[setup] Cancelled — no changes made.'
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
