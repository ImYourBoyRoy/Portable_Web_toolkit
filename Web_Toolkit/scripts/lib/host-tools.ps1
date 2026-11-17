# ./Web_Toolkit/scripts/lib/host-tools.ps1
# Shared host-tool detection for bootstrap.ps1 and setup-interactive.ps1 (Windows). Dot-sourced, never run directly.
# Needs: $ToolkitRoot and $ManifestPath. Nothing here names a Node, pnpm or Enchi version to install:
# Node is resolved from nodejs.org at run time; pnpm and Enchi come from their own latest-release installers.

# Cache for Resolve-LatestNode; initialised because both callers run under Set-StrictMode, which rejects reading an unset variable.
$script:LatestNode = $null

function Get-Manifest { Get-Content -Raw $ManifestPath | ConvertFrom-Json }

function Get-ManifestValue($Manifest, [string]$Key, [string]$Default = '') { $property = $Manifest.PSObject.Properties[$Key]; if ($property) { [string]$property.Value } else { $Default } }

function Resolve-CommandPath([string]$Name) {
    $commands = @(Get-Command $Name -All -ErrorAction SilentlyContinue)
    if (-not $commands -or $commands.Count -eq 0) { return '' }
    $preferred = $commands | Where-Object { $_.CommandType -eq 'Application' -and $_.Path } | Select-Object -First 1
    if ($preferred) { return $preferred.Path }
    $fallback = $commands | Where-Object { $_.Source } | Select-Object -First 1
    if ($fallback) { return $fallback.Source }
    ''
}

function Resolve-VersionProbePath([string]$Name) {
    if ($Name -in @('python', 'pip')) {
        $pyenv = Resolve-EnchiCommand
        if ($pyenv) {
            try {
                $resolved = (& $pyenv 'which' $Name 2>$null | Select-Object -First 1).Trim()
                if ($resolved -and (Test-Path $resolved)) { return $resolved }
            } catch {}
        }
    }
    Resolve-CommandPath $Name
}

function Get-CommandVersion([string]$Name, [string[]]$Arguments = @('--version')) {
    if (-not $Arguments -or $Arguments.Count -eq 0) { $Arguments = @('--version') }
    $cmd = Resolve-VersionProbePath $Name
    if (-not $cmd) { return '' }
    try {
        $line = & $cmd @Arguments 2>$null | Select-Object -First 1
        if ($null -eq $line) { return '' }
        $line.ToString().Trim()
    } catch { '' }
}

function Compare-Version([string]$Left, [string]$Right) { $lp = (($Left -replace '^[^0-9]*', '') -split '\.') | ? { $_ -match '^\d+$' } | % { [int]$_ }; $rp = (($Right -replace '^[^0-9]*', '') -split '\.') | ? { $_ -match '^\d+$' } | % { [int]$_ }; $count = [Math]::Max($lp.Count, $rp.Count); for ($i = 0; $i -lt $count; $i++) { $l = if ($i -lt $lp.Count) { $lp[$i] } else { 0 }; $r = if ($i -lt $rp.Count) { $rp[$i] } else { 0 }; if ($l -gt $r) { return 1 }; if ($l -lt $r) { return -1 } }; return 0 }

function Add-PathEntry([string]$Dir) {
    if ($Dir -and (Test-Path -LiteralPath $Dir) -and (($env:PATH -split ';') -notcontains $Dir)) { $env:PATH = "$Dir;$env:PATH" }
}

function Get-NodeMajor($Manifest) {
    $pinFile = Join-Path $ToolkitRoot '..\.node-version'
    if (Test-Path -LiteralPath $pinFile) {
        $pin = (Get-Content -LiteralPath $pinFile -TotalCount 1).Trim()
        if ($pin -match '^v?(\d+)') { return [string]$Matches[1] }
    }
    Get-ManifestValue $Manifest 'tool.node.major' '26'
}

function Resolve-LatestNode($Manifest) {
    if ($script:LatestNode) { return $script:LatestNode }
    $major = Get-NodeMajor $Manifest
    $base = Get-ManifestValue $Manifest 'tool.node.dist_base' 'https://nodejs.org/dist'
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    try { $sums = (Invoke-WebRequest -Uri "$base/latest-v$major.x/SHASUMS256.txt" -UseBasicParsing -TimeoutSec 20).Content } catch { return $null }
    $match = [regex]::Match([string]$sums, "(?m)^([0-9a-f]{64})\s+(node-v(\d+\.\d+\.\d+)-$arch\.msi)\s*$")
    if (-not $match.Success) { return $null }
    $script:LatestNode = [pscustomobject]@{ Major = $major; Version = $match.Groups[3].Value; File = $match.Groups[2].Value; Sha256 = $match.Groups[1].Value; Url = "$base/latest-v$major.x/$($match.Groups[2].Value)" }
    $script:LatestNode
}

function Test-NodeNeedsInstall($Manifest) {
    $installed = Get-CommandVersion 'node'
    if (-not $installed) { return $true }
    $major = [int](Get-NodeMajor $Manifest)
    if ((Compare-Version $installed "$major.0.0") -lt 0) { return $true }
    if ([int](($installed -replace '^[^0-9]*', '') -split '\.')[0] -ne $major) { return $false }
    $latest = Resolve-LatestNode $Manifest
    if (-not $latest) { return $false }
    (Compare-Version $installed $latest.Version) -lt 0
}

function Add-PnpmToPath {
    foreach ($dir in @($env:PNPM_HOME, (Join-Path $env:LOCALAPPDATA 'pnpm'), (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'))) { Add-PathEntry $dir }
}

function Get-PnpmVersion { Add-PnpmToPath; Get-CommandVersion 'pnpm' }

function Get-EnchiRoots { @((Join-Path $env:USERPROFILE '.enchi'), (Join-Path $env:USERPROFILE '.pyenv')) }

function Resolve-EnchiCommand {
    foreach ($name in @('enchi.exe', 'pyenv.exe')) {
        foreach ($root in (Get-EnchiRoots)) {
            foreach ($path in @((Join-Path $root "bin\$name"), (Join-Path $root $name))) { if (Test-Path -LiteralPath $path) { return $path } }
        }
    }
    foreach ($name in @('enchi', 'pyenv')) { $candidate = Resolve-CommandPath $name; if ($candidate) { return $candidate } }
    foreach ($root in (Get-EnchiRoots)) {
        if (Test-Path -LiteralPath $root) { $found = Get-ChildItem -Path $root -Recurse -Include enchi.exe, pyenv.exe -File -ErrorAction SilentlyContinue | Select-Object -First 1; if ($found) { return $found.FullName } }
    }
    ''
}

function Add-EnchiToPath {
    foreach ($root in (Get-EnchiRoots)) { foreach ($sub in @('bin', 'shims')) { Add-PathEntry (Join-Path $root $sub) } }
}

function Get-EnchiVersion { $enchi = Resolve-EnchiCommand; if (-not $enchi) { return '' }; Add-EnchiToPath; try { (& $enchi --version 2>$null | Select-Object -First 1).Trim() } catch { '' } }

function Get-EnchiGuiPath {
    foreach ($name in @('enchi-gui.exe', 'pyenv-gui.exe')) {
        foreach ($root in (Get-EnchiRoots)) {
            foreach ($path in @((Join-Path $root "bin\$name"), (Join-Path $root $name))) { if (Test-Path -LiteralPath $path) { return $path } }
        }
        $candidate = Resolve-CommandPath ($name -replace '\.exe$', '')
        if ($candidate) { return $candidate }
    }
    $null
}

function Test-EnchiGuiAvailable {
    if (Get-EnchiGuiPath) { return $true }
    $enchi = Resolve-EnchiCommand
    if (-not $enchi) { return $false }
    try { $help = & $enchi 'gui' '--help' 2>$null; return $LASTEXITCODE -eq 0 -or ($help -and "$help" -match 'gui') } catch { return $false }
}
