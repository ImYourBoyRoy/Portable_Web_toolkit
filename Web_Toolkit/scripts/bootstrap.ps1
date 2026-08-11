# ./Web_Toolkit/scripts/bootstrap.ps1
<#
Native bootstrap for Windows host provisioning.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ToolkitRoot = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$ManifestPath = Join-Path $ToolkitRoot 'Setup_agent_environment\config\host-bootstrap.manifest.json'
$NodeDoctorPath = Join-Path $ToolkitRoot 'Setup_agent_environment\bin\agent-env-setup.mjs'
$ElevationMarker = '--bootstrap-elevated'

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
        $pyenv = Resolve-PyenvCommand
        if ($pyenv) {
            try {
                $resolved = (& $pyenv 'which' $Name 2>$null | Select-Object -First 1).Trim()
                if ($resolved -and (Test-Path $resolved)) { return $resolved }
            } catch {}
        }
    }
    Resolve-CommandPath $Name
}
function Get-CommandVersion([string]$Name, [string[]]$Args = @('--version')) {
    if (-not $Args -or $Args.Count -eq 0) { $Args = @('--version') }
    $cmd = Resolve-VersionProbePath $Name
    if (-not $cmd) { return '' }
    try {
        $line = & $cmd @Args 2>$null | Select-Object -First 1
        if ($null -eq $line) { return '' }
        $line.ToString().Trim()
    } catch { '' }
}
function Compare-Version([string]$Left, [string]$Right) { $lp = (($Left -replace '^[^0-9]*', '') -split '\.') | ? { $_ -match '^\d+$' } | % { [int]$_ }; $rp = (($Right -replace '^[^0-9]*', '') -split '\.') | ? { $_ -match '^\d+$' } | % { [int]$_ }; $count = [Math]::Max($lp.Count, $rp.Count); for ($i = 0; $i -lt $count; $i++) { $l = if ($i -lt $lp.Count) { $lp[$i] } else { 0 }; $r = if ($i -lt $rp.Count) { $rp[$i] } else { 0 }; if ($l -gt $r) { return 1 }; if ($l -lt $r) { return -1 } }; return 0 }
function ConvertTo-NormalizedEnvName([string]$Value) { $n = ($Value.ToLowerInvariant() -replace '[^a-z0-9]+', '-') -replace '^-+', '' -replace '-+$', ''; if ([string]::IsNullOrWhiteSpace($n)) { 'workspace' } else { $n } }
function Test-IsAdmin { $identity = [Security.Principal.WindowsIdentity]::GetCurrent(); $principal = New-Object Security.Principal.WindowsPrincipal($identity); $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }

function Parse-BootstrapArgs {
    param([string[]]$RawArgs)
    $flags = @{
        workspace = (Get-Location).Path
        json = $false
        'skip-workspace-checks' = $false
        'allow-installs' = $true
        'install-optional-tools' = $true
        'install-python-playwright' = $true
        'optional-tools' = @()
    }
    $command = 'prepare-host'
    if ($RawArgs.Count -gt 0 -and $RawArgs[0] -notmatch '^--') { $command = $RawArgs[0] }
    if ($command -eq $ElevationMarker) { $command = if ($RawArgs.Count -gt 1 -and $RawArgs[1] -notmatch '^--') { $RawArgs[1] } else { 'prepare-host' } }
    for ($i = 0; $i -lt $RawArgs.Count; $i++) {
        switch ($RawArgs[$i]) {
            '--workspace' { if ($i + 1 -lt $RawArgs.Count) { $flags.workspace = [System.IO.Path]::GetFullPath($RawArgs[$i + 1]) } }
            '--json' { $flags.json = $true }
            '--skip-workspace-checks' { $flags['skip-workspace-checks'] = $true }
            '--allow-installs' { if ($i + 1 -lt $RawArgs.Count) { $flags['allow-installs'] = @('1', 'true', 'yes', 'on') -contains $RawArgs[$i + 1].ToLowerInvariant() } }
            '--install-optional-tools' { if ($i + 1 -lt $RawArgs.Count) { $flags['install-optional-tools'] = @('1', 'true', 'yes', 'on') -contains $RawArgs[$i + 1].ToLowerInvariant() } }
            '--install-python-playwright' { if ($i + 1 -lt $RawArgs.Count) { $flags['install-python-playwright'] = @('1', 'true', 'yes', 'on') -contains $RawArgs[$i + 1].ToLowerInvariant() } }
            '--optional-tools' { if ($i + 1 -lt $RawArgs.Count) { $flags['optional-tools'] = @($RawArgs[$i + 1] -split ',' | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ }) } }
        }
    }
    @{ command = $command.ToLowerInvariant(); flags = $flags }
}

function Initialize-Report($Manifest, [string]$Command, [hashtable]$Flags) {
    $reportPath = Join-Path $ToolkitRoot (Get-ManifestValue $Manifest 'report.path' '.runtime/reports/setup-agent-environment.json')
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $reportPath) | Out-Null
    [ordered]@{
        checkedAt = (Get-Date).ToString('o')
        platform = 'windows'
        architecture = $env:PROCESSOR_ARCHITECTURE
        command = $Command
        workspace = $Flags.workspace
        elevated = (Test-IsAdmin)
        manifestPath = $ManifestPath
        reportPath = $reportPath
        results = [ordered]@{
            current = @()
            installed = @()
            skipped = @()
            failed = @()
        }
        workspaceReadiness = [ordered]@{}
        notes = @()
    }
}

function Add-ReportEntry {
    param([hashtable]$Report,[string]$Bucket,[string]$Name,[string]$RequiredVersion='',[string]$DetectedBefore='',[string]$DetectedAfter='',[string]$Source='',[string]$Status='',[string]$Details='',[string]$NextStep='',[string]$Kind='tool')
    $Report.results[$Bucket] += [pscustomobject]([ordered]@{
        kind = $Kind; name = $Name; requiredVersion = $RequiredVersion; detectedBefore = $DetectedBefore; detectedAfter = $DetectedAfter; source = $Source; architecture = $Report.architecture; elevated = $Report.elevated; status = $Status; details = $Details; nextStep = $NextStep
    })
}

function Save-Report([hashtable]$Report, [bool]$EmitJson) {
    $json = $Report | ConvertTo-Json -Depth 8
    Set-Content -LiteralPath $Report.reportPath -Value $json -Encoding UTF8
    if ($EmitJson) { $json; return }
    Write-Host "`n[Web Toolkit] Host bootstrap summary" -ForegroundColor Cyan
    Write-Host "  Command: $($Report.command)"
    Write-Host "  Workspace: $($Report.workspace)"
    Write-Host "  Elevated: $($Report.elevated)"
    Write-Host "  Report: $($Report.reportPath)"
    foreach ($bucket in @('current','installed','skipped','failed')) {
        Write-Host "`n  $bucket" -ForegroundColor ($(switch($bucket){'failed'{'Red'}'skipped'{'Yellow'}default{'Green'}}))
        if ($Report.results[$bucket].Count -eq 0) { Write-Host '    - none'; continue }
        foreach ($entry in $Report.results[$bucket]) {
            $parts = @($entry.status, $entry.details, $entry.nextStep) | ? { -not [string]::IsNullOrWhiteSpace($_) }
            Write-Host "    - $($entry.name): $($parts -join ' | ')"
        }
    }
}

function Test-NeedsInstall($Manifest, [hashtable]$Flags) {
    if (-not (Get-CommandVersion 'git')) { return $true }
    
    $nodeRequired = Get-ManifestValue $Manifest 'tool.node.required_version'
    $nodeVersion = Get-CommandVersion 'node'
    if (-not $nodeVersion -or (Compare-Version $nodeVersion $nodeRequired) -lt 0) { return $true }
    
    $pyenvRequired = Get-ManifestValue $Manifest 'tool.pyenv_native.minimum_version'
    $pyenvVersion = Get-PyenvVersion
    if (-not $pyenvVersion -or (Compare-Version $pyenvVersion $pyenvRequired) -lt 0) { return $true }
    
    $pythonRequired = Get-ManifestValue $Manifest 'tool.python.minimum_version'
    $pythonVersion = Get-CommandVersion 'python'
    if (-not $pythonVersion -or (Compare-Version $pythonVersion $pythonRequired) -lt 0) { return $true }
    
    $workspace = $Flags.workspace
    $venvName = ConvertTo-NormalizedEnvName (Split-Path -Leaf $workspace)
    $desiredVersion = Resolve-DesiredPythonVersion $Manifest
    try {
        $versionsOutput = (Invoke-Pyenv -Args @('versions') 2>$null) -join "`n"
        if ($versionsOutput -notmatch [Regex]::Escape($desiredVersion)) { return $true }
        $targetSpec = "$desiredVersion/envs/$venvName"
        if ($versionsOutput -notmatch [Regex]::Escape($targetSpec)) { return $true }
    } catch { return $true }

    if ($Flags['install-python-playwright']) {
        try {
            $playwrightVersion = (Invoke-Pyenv -Args @('exec', 'python', '-m', 'playwright', '--version') -WorkingDirectory $workspace 2>$null | Select-Object -First 1).Trim()
            if (-not $playwrightVersion) { return $true }
        } catch { return $true }
    }

    if ($Flags['install-optional-tools']) {
        $optOrder = Get-ManifestValue $Manifest 'tool.optional.order'
        if ($optOrder) {
            foreach ($toolKey in $optOrder.Split(',')) {
                if ($toolKey -eq 'python-playwright') { continue }
                $commandName = switch ($toolKey) { 'gh' { 'gh' } 'dotnet' { 'dotnet' } default { $toolKey } }
                if (-not (Get-CommandVersion $commandName)) {
                    $packageId = Get-ManifestValue $Manifest "tool.$toolKey.windows.package_id"
                    if ($packageId) { return $true }
                }
            }
        }
    }
    return $false
}

function Ensure-Elevation($Manifest, [string]$Command, [string[]]$RawArgs, [hashtable]$Flags) {
    if ($Command -notin @('fix','prepare-host') -or -not $Flags['allow-installs'] -or (Test-IsAdmin)) { return }
    
    # Only request elevation if there's actually a need to install or update something
    if (-not (Test-NeedsInstall $Manifest $Flags)) { return }

    if ($RawArgs -contains $ElevationMarker) { throw 'Bootstrap relaunch requested elevation but did not receive an elevated session.' }
    Write-Host "`n[Web Toolkit] Requesting administrator elevation before installs..." -ForegroundColor Yellow
    $relayArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$PSCommandPath,$ElevationMarker) + $RawArgs
    $quoted = $relayArgs | % { if ($_ -match '\s|"') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }
    $elevatedShell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { (Get-Command pwsh).Source } else { 'powershell.exe' }
    $process = Start-Process -FilePath $elevatedShell -Verb RunAs -ArgumentList $quoted -WorkingDirectory $Flags.workspace -PassThru -Wait
    exit $process.ExitCode
}

function Unblock-ToolkitPowerShellFiles {
    Get-ChildItem -Path $ToolkitRoot -Filter *.ps1 -Recurse -File -ErrorAction SilentlyContinue | % {
        try { Unblock-File -LiteralPath $_.FullName -ErrorAction Stop } catch {}
    }
}

function Get-WorkspaceReadiness([string]$Workspace) {
    $packageJson = $null
    $packageJsonPath = Join-Path $Workspace 'package.json'
    if (Test-Path $packageJsonPath) { try { $packageJson = Get-Content -Raw $packageJsonPath | ConvertFrom-Json } catch {} }
    $scripts = $null
    if ($packageJson -and $packageJson.PSObject.Properties['scripts']) { $scripts = $packageJson.scripts }
    [ordered]@{
        exists = (Test-Path $Workspace)
        hasGitRepo = (Test-Path (Join-Path $Workspace '.git'))
        hasAgents = (Test-Path (Join-Path $Workspace 'AGENTS.md'))
        hasReadme = (Test-Path (Join-Path $Workspace 'README.md'))
        hasMemory = (Test-Path (Join-Path $Workspace 'MEMORY.md'))
        hasEnvExample = (Test-Path (Join-Path $Workspace '.env.example'))
        hasPackageJson = [bool]$packageJson
        hasPreviewScript = [bool](($scripts -and $scripts.PSObject.Properties['preview']) -or ($scripts -and $scripts.PSObject.Properties['dev']))
        hasValidationScript = [bool](($scripts -and $scripts.PSObject.Properties['test']) -or ($scripts -and $scripts.PSObject.Properties['check']))
        hasAstroConfig = [bool](@('astro.config.mjs','astro.config.js','astro.config.ts','astro.config.cjs') | ? { Test-Path (Join-Path $Workspace $_) } | Select-Object -First 1)
    }
}

function Add-WorkspaceReadinessEntries([hashtable]$Report, [hashtable]$Flags) {
    if ($Flags['skip-workspace-checks']) {
        Add-ReportEntry $Report skipped 'Workspace readiness' '' '' '' 'filesystem' 'skipped' 'Flag disabled' '' 'workspace'
        return
    }
    $readiness = Get-WorkspaceReadiness $Flags.workspace
    $Report.workspaceReadiness = [pscustomobject]$readiness
    foreach ($pair in $readiness.GetEnumerator()) {
        $bucket = if ($pair.Value) { 'current' } else { 'failed' }
        $status = if ($pair.Value) { 'present' } else { 'missing' }
        Add-ReportEntry $Report $bucket "Workspace:$($pair.Key)" '' '' ([string]$pair.Value) 'filesystem' $status "Workspace check for $($pair.Key)" '' 'workspace'
    }
}

function Test-WingetAvailable { [bool](Resolve-CommandPath 'winget') }
function Test-WingetPackageInstalled([string]$Id) {
    if (-not (Test-WingetAvailable)) { return $false }
    $result = & winget list --id $Id --exact --accept-source-agreements 2>$null
    $LASTEXITCODE -eq 0 -and ($result -join "`n") -match [Regex]::Escape($Id)
}
function Invoke-WingetEnsurePackage([string]$Id, [string]$Label) {
    if (-not (Test-WingetAvailable)) { throw "winget is required to manage $Label on Windows." }
    $common = @('--id',$Id,'--exact','--accept-package-agreements','--accept-source-agreements')
    if (Test-WingetPackageInstalled $Id) { & winget upgrade @common --silent } else { & winget install @common --silent }
    if ($LASTEXITCODE -ne 0) { throw "winget failed while managing $Label ($Id)." }
}

function Resolve-PyenvCommand {
    $root = Join-Path $env:USERPROFILE '.pyenv'
    foreach ($path in @((Join-Path $root 'bin\pyenv.exe'), (Join-Path $root 'pyenv.exe'))) { if (Test-Path $path) { return $path } }
    $candidate = Resolve-CommandPath 'pyenv'
    if ($candidate) { return $candidate }
    if (Test-Path $root) { $found = Get-ChildItem -Path $root -Recurse -Filter pyenv.exe -File -ErrorAction SilentlyContinue | Select-Object -First 1; if ($found) { return $found.FullName } }
    ''
}

function Add-PyenvToPath {
    foreach ($pathEntry in @((Join-Path $env:USERPROFILE '.pyenv\bin'), (Join-Path $env:USERPROFILE '.pyenv\shims'))) {
        if ((Test-Path $pathEntry) -and (($env:PATH -split ';') -notcontains $pathEntry)) { $env:PATH = "$pathEntry;$env:PATH" }
    }
}
function Get-PyenvVersion { $pyenv = Resolve-PyenvCommand; if (-not $pyenv) { return '' }; Add-PyenvToPath; try { (& $pyenv --version 2>$null | Select-Object -First 1).Trim() } catch { '' } }
function Invoke-Pyenv([string[]]$Args, [string]$WorkingDirectory = '') { $pyenv = Resolve-PyenvCommand; if (-not $pyenv) { throw 'pyenv-native is not available in PATH.' }; Add-PyenvToPath; if ($WorkingDirectory) { Push-Location $WorkingDirectory; try { & $pyenv @Args } finally { Pop-Location } } else { & $pyenv @Args } }

function Get-PyenvGuiPath {
    $binName = 'pyenv-gui.exe'
    $root = Join-Path $env:USERPROFILE '.pyenv'
    foreach ($path in @(
        (Join-Path $root "bin\$binName"),
        (Join-Path $root $binName),
        (Resolve-CommandPath 'pyenv-gui')
    )) {
        if ($path -and (Test-Path $path)) { return $path }
    }
    if (Test-Path $root) {
        $found = Get-ChildItem -Path $root -Recurse -Filter $binName -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

function Test-PyenvGuiAvailable {
    if (Get-PyenvGuiPath) { return $true }
    $pyenv = Resolve-PyenvCommand
    if (-not $pyenv) { return $false }
    try {
        $help = & $pyenv 'gui' '--help' 2>$null
        return $LASTEXITCODE -eq 0 -or ($help -and "$help" -match 'gui')
    } catch { return $false }
}

function Ensure-Git([hashtable]$Report) {
    $before = Get-CommandVersion 'git'
    if ($before) { Add-ReportEntry $Report current 'Git' '' $before $before 'PATH' 'already-current' 'Git already available'; return }
    try { Invoke-WingetEnsurePackage 'Git.Git' 'Git'; $after = Get-CommandVersion 'git'; if ($after) { Add-ReportEntry $Report installed 'Git' '' $before $after 'winget:Git.Git' 'installed' 'Installed Git via winget'; return } } catch {}
    Add-ReportEntry $Report failed 'Git' '' $before '' 'winget:Git.Git' 'failed' 'Git still missing after install attempt' 'Install Git manually and rerun bootstrap.'
}

function Ensure-Node($Manifest, [hashtable]$Report) {
    $required = Get-ManifestValue $Manifest 'tool.node.required_version'
    $before = Get-CommandVersion 'node'
    if ($before -and (Compare-Version $before $required) -ge 0) {
        Add-ReportEntry $Report current 'Node.js' $required $before $before 'PATH' 'already-current' 'Node satisfies the latest-current policy'
        foreach ($tool in @('npm','npx')) { $version = Get-CommandVersion $tool; Add-ReportEntry $Report current $tool '' $version $version 'Node bundle' 'already-current' "$tool available with Node" }
        return
    }
    $packageId = Get-ManifestValue $Manifest 'tool.node.windows.package_id'
    try {
        Invoke-WingetEnsurePackage $packageId 'Node.js'
        $after = Get-CommandVersion 'node'
        if ($after -and (Compare-Version $after $required) -ge 0) {
            Add-ReportEntry $Report installed 'Node.js' $required $before $after "winget:$packageId" 'installed-or-updated' 'Installed or updated Node.js current line'
            foreach ($tool in @('npm','npx')) { $version = Get-CommandVersion $tool; Add-ReportEntry $Report installed $tool '' '' $version 'Node bundle' 'available' "$tool available after Node install" }
            return
        }
    } catch {
        Add-ReportEntry $Report failed 'Node.js' $required $before '' "winget:$packageId" 'failed' $_.Exception.Message 'Install the latest Node current release manually, then rerun bootstrap.'
        return
    }
    Add-ReportEntry $Report failed 'Node.js' $required $before (Get-CommandVersion 'node') "winget:$packageId" 'failed' 'Node did not satisfy the required current line after install' 'Install the latest Node current release manually, then rerun bootstrap.'
}

function Install-PyenvNative($Manifest) {
    $url = Get-ManifestValue $Manifest 'tool.pyenv_native.windows.install_url'
    $tempPath = Join-Path $env:TEMP 'pyenv-native-install.ps1'
    Invoke-WebRequest -Uri $url -OutFile $tempPath
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tempPath
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    Add-PyenvToPath
}

function Ensure-PyenvNative($Manifest, [hashtable]$Report) {
    $required = Get-ManifestValue $Manifest 'tool.pyenv_native.minimum_version'
    Add-PyenvToPath
    $before = Get-PyenvVersion
    try {
        if ($before -and (Compare-Version $before $required) -ge 0) { Add-ReportEntry $Report current 'pyenv-native (pyenv)' $required $before $before 'PATH' 'already-current' 'pyenv-native CLI satisfies policy'; return }
        if ($before) { Invoke-Pyenv -Args @('self-update') | Out-Null } else { Install-PyenvNative $Manifest }
        $after = Get-PyenvVersion
        if ($after -and (Compare-Version $after $required) -ge 0) { Add-ReportEntry $Report installed 'pyenv-native (pyenv)' $required $before $after 'github-release-installer/self-update' 'installed-or-updated' 'pyenv-native CLI ready — use `pyenv` / `pyenv gui`' ; return }
    } catch {
        Add-ReportEntry $Report failed 'pyenv-native (pyenv)' $required $before '' 'github-release-installer/self-update' 'failed' $_.Exception.Message 'Install pyenv-native manually from the latest GitHub release and rerun bootstrap.'
        return
    }
    Add-ReportEntry $Report failed 'pyenv-native (pyenv)' $required $before (Get-PyenvVersion) 'github-release-installer/self-update' 'failed' 'pyenv-native did not satisfy policy after install/update' 'Install pyenv-native manually from the latest GitHub release and rerun bootstrap.'
}

function Ensure-PyenvGui($Manifest, [hashtable]$Report) {
    Add-PyenvToPath
    $targetDir = Join-Path $env:USERPROFILE '.pyenv\bin'
    $targetPath = Join-Path $targetDir (Get-ManifestValue $Manifest 'tool.pyenv_gui.binary_name.windows' 'pyenv-gui.exe')
    $url = Get-ManifestValue $Manifest 'tool.pyenv_gui.windows.x64.download_url'
    $before = if (Test-PyenvGuiAvailable) { 'present' } else { '' }
    try {
        if ($before) {
            Add-ReportEntry $Report current 'pyenv-gui' '' $before $before 'pyenv-native' 'already-current' 'pyenv-gui available — launch with `pyenv gui` or pyenv-gui.exe'
            return
        }
        if (-not $url) { throw 'tool.pyenv_gui.windows.x64.download_url missing from manifest' }
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
        Invoke-WebRequest -Uri $url -OutFile $targetPath
        Unblock-File -LiteralPath $targetPath -ErrorAction SilentlyContinue
        Add-PyenvToPath
        if (Test-PyenvGuiAvailable -or (Test-Path $targetPath)) {
            Add-ReportEntry $Report installed 'pyenv-gui' '' $before 'present' 'github-release' 'installed' 'pyenv-gui installed — launch with `pyenv gui`'
            return
        }
        throw 'pyenv-gui binary missing after download'
    } catch {
        Add-ReportEntry $Report failed 'pyenv-gui' '' $before '' 'github-release' 'failed' $_.Exception.Message 'Download pyenv-gui from the pyenv-native release assets and place it in %USERPROFILE%\.pyenv\bin, then run `pyenv gui`.'
    }
}

function Resolve-DesiredPythonVersion($Manifest) {
    $prefix = Get-ManifestValue $Manifest 'tool.python.desired_prefix'
    $fallback = Get-ManifestValue $Manifest 'tool.python.fallback_version'
    try { $resolved = (Invoke-Pyenv -Args @('latest', $prefix) 2>$null | Select-Object -First 1).Trim(); if ($resolved) { return $resolved } } catch {}
    $fallback
}

function Ensure-PythonRuntime($Manifest, [hashtable]$Report, [hashtable]$Flags) {
    $workspace = $Flags.workspace
    $venvName = ConvertTo-NormalizedEnvName (Split-Path -Leaf $workspace)
    $required = Get-ManifestValue $Manifest 'tool.python.minimum_version'
    $beforePython = Get-CommandVersion 'python'
    $beforePip = Get-CommandVersion 'pip'
    $desiredVersion = Resolve-DesiredPythonVersion $Manifest
    try {
        $versionsOutput = (Invoke-Pyenv -Args @('versions')) -join "`n"
        if ($versionsOutput -notmatch [Regex]::Escape($desiredVersion)) { Invoke-Pyenv -Args @('install', $desiredVersion) | Out-Null; $versionsOutput = (Invoke-Pyenv -Args @('versions')) -join "`n" }
        # Prefer the desired line as the user-global Python (latest installed for that prefix).
        try { Invoke-Pyenv -Args @('global', $desiredVersion) | Out-Null } catch { }
        $targetSpec = "$desiredVersion/envs/$venvName"
        if ($versionsOutput -notmatch [Regex]::Escape($targetSpec)) { Invoke-Pyenv -Args @('venv', 'create', $desiredVersion, $venvName) | Out-Null }
        Invoke-Pyenv -Args @('local', $targetSpec) -WorkingDirectory $workspace | Out-Null
        Invoke-Pyenv -Args @('exec', 'python', '-m', 'pip', 'install', '--upgrade', 'pip') -WorkingDirectory $workspace | Out-Null
        $afterPython = (Invoke-Pyenv -Args @('exec', 'python', '--version') -WorkingDirectory $workspace | Select-Object -First 1).Trim()
        $afterPip = (Invoke-Pyenv -Args @('exec', 'python', '-m', 'pip', '--version') -WorkingDirectory $workspace | Select-Object -First 1).Trim()
        Add-ReportEntry $Report installed 'Python runtime' $required $beforePython $afterPython 'pyenv-native' 'installed-or-selected' "Workspace bound to $targetSpec; pyenv global set to $desiredVersion"
        Add-ReportEntry $Report installed 'pip' '' $beforePip $afterPip 'pyenv-native' 'installed-or-updated' 'pip upgraded inside the managed venv'
        return
    } catch {
        Add-ReportEntry $Report failed 'Python runtime' $required $beforePython '' 'pyenv-native' 'failed' $_.Exception.Message 'Run pyenv doctor, ensure shell integration is healthy, and rerun bootstrap.'
    }
}

function Ensure-PythonPlaywright($Manifest, [hashtable]$Report, [hashtable]$Flags) {
    if (-not $Flags['install-python-playwright']) { Add-ReportEntry $Report skipped 'Python Playwright' '' '' '' 'pyenv-native venv' 'skipped' 'Flag disabled'; return }
    try { $before = (Invoke-Pyenv -Args @('exec', 'python', '-m', 'playwright', '--version') -WorkingDirectory $Flags.workspace | Select-Object -First 1).Trim() } catch { $before = '' }
    if ($before) { Add-ReportEntry $Report current 'Python Playwright' '' $before $before 'pyenv-native venv' 'already-current' 'Playwright already installed in the managed venv'; return }
    try {
        $package = Get-ManifestValue $Manifest 'tool.python_playwright.package' 'playwright'
        $browser = Get-ManifestValue $Manifest 'tool.python_playwright.browser' 'chromium'
        Invoke-Pyenv -Args @('exec', 'python', '-m', 'pip', 'install', $package) -WorkingDirectory $Flags.workspace | Out-Null
        Invoke-Pyenv -Args @('exec', 'python', '-m', 'playwright', 'install', $browser) -WorkingDirectory $Flags.workspace | Out-Null
        $after = (Invoke-Pyenv -Args @('exec', 'python', '-m', 'playwright', '--version') -WorkingDirectory $Flags.workspace | Select-Object -First 1).Trim()
        Add-ReportEntry $Report installed 'Python Playwright' '' $before $after 'pyenv-native venv' 'installed' "Installed $package + $browser"
    } catch {
        Add-ReportEntry $Report failed 'Python Playwright' '' $before '' 'pyenv-native venv' 'failed' $_.Exception.Message 'Retry browser automation installation after confirming the managed venv is healthy.'
    }
}

function Test-OptionalToolSelected([string]$ToolKey, [hashtable]$Flags) {
    if (-not $Flags['install-optional-tools']) { return $false }
    $selected = $Flags['optional-tools']
    if ($selected -and $selected.Count -gt 0) { return $selected -contains $ToolKey.ToLowerInvariant() }
    return $true
}

function Ensure-OptionalWindowsTools($Manifest, [hashtable]$Report, [hashtable]$Flags) {
    if (-not $Flags['install-optional-tools']) { Add-ReportEntry $Report skipped 'Optional host tools' '' '' '' 'manifest' 'skipped' 'Flag disabled'; return }
    foreach ($toolKey in (Get-ManifestValue $Manifest 'tool.optional.order').Split(',')) {
        if ($toolKey -eq 'python-playwright') { continue }
        if (-not (Test-OptionalToolSelected $toolKey $Flags)) { Add-ReportEntry $Report skipped ($toolKey) '' '' '' 'manifest' 'skipped' 'Not selected in setup menu'; continue }
        $name = switch ($toolKey) { 'bun' { 'Bun' } 'gh' { 'GitHub CLI' } 'dotnet' { '.NET SDK' } default { $toolKey } }
        $commandName = switch ($toolKey) { 'gh' { 'gh' } 'dotnet' { 'dotnet' } default { $toolKey } }
        $before = Get-CommandVersion $commandName
        if ($before) { Add-ReportEntry $Report current $name '' $before $before 'PATH' 'already-current' "$name already installed"; continue }
        $packageId = Get-ManifestValue $Manifest "tool.$toolKey.windows.package_id"
        if (-not $packageId) { Add-ReportEntry $Report skipped $name '' '' '' 'manifest' 'skipped' 'No Windows package id configured'; continue }
        try { Invoke-WingetEnsurePackage $packageId $name; $after = Get-CommandVersion $commandName; Add-ReportEntry $Report installed $name '' $before $after "winget:$packageId" 'installed' "Installed $name via winget" } catch { Add-ReportEntry $Report failed $name '' $before '' "winget:$packageId" 'failed' $_.Exception.Message "Install $name manually if you need it on this workstation." }
    }
}

function Invoke-NodeDoctorIfAvailable([hashtable]$Report, [hashtable]$Flags) {
    $node = Resolve-CommandPath 'node'
    if (-not $node -or -not (Test-Path $NodeDoctorPath)) { Add-ReportEntry $Report skipped 'Node doctor' '' '' '' 'agent-env-setup' 'skipped' 'Node diagnostic tool unavailable after bootstrap'; return }
    try {
        $args = @($NodeDoctorPath, 'doctor', '--workspace', $Flags.workspace, '--json')
        if ($Flags['skip-workspace-checks']) { $args += '--skip-workspace-checks' }
        $null = & $node @args
        Add-ReportEntry $Report current 'Node doctor' '' '' 'available' 'agent-env-setup doctor' 'post-bootstrap-diagnostic' 'Node-based diagnostics remain available after native bootstrap'
    } catch {
        Add-ReportEntry $Report skipped 'Node doctor' '' '' '' 'agent-env-setup doctor' 'skipped' 'Native bootstrap completed but Node doctor could not be executed'
    }
}

function Invoke-DoctorOnly($Manifest, [hashtable]$Report, [hashtable]$Flags) {
    $nodeRequired = Get-ManifestValue $Manifest 'tool.node.required_version'
    $nodeVersion = Get-CommandVersion 'node'
    foreach ($pair in @(
        @{ name = 'Git'; version = (Get-CommandVersion 'git'); required = '' ; details = 'Git available' },
        @{ name = 'Node.js'; version = $nodeVersion; required = $nodeRequired; details = 'Node missing or below the required current line' },
        @{ name = 'pyenv-native (pyenv)'; version = (Get-PyenvVersion); required = (Get-ManifestValue $Manifest 'tool.pyenv_native.minimum_version'); details = 'pyenv-native CLI not found — install pyenv-native; do not use system Python' },
        @{ name = 'pyenv-gui'; version = $(if (Test-PyenvGuiAvailable) { 'present' } else { '' }); required = ''; details = 'pyenv-gui missing — required companion; launch via `pyenv gui`' },
        @{ name = 'Python runtime'; version = (Get-CommandVersion 'python'); required = (Get-ManifestValue $Manifest 'tool.python.minimum_version'); details = 'Python executable not found under pyenv-native' },
        @{ name = 'pip'; version = (Get-CommandVersion 'pip'); required = ''; details = 'pip not found under pyenv-native venv' }
    )) {
        $ok = -not [string]::IsNullOrWhiteSpace($pair.version)
        if ($ok -and $pair.required) { $ok = (Compare-Version $pair.version $pair.required) -ge 0 }
        if ($ok) { Add-ReportEntry $Report current $pair.name $pair.required $pair.version $pair.version 'PATH' 'already-current' ($pair.name + ' available') } else { Add-ReportEntry $Report failed $pair.name $pair.required $pair.version '' 'PATH' 'missing-or-out-of-policy' $pair.details }
    }
    Add-WorkspaceReadinessEntries $Report $Flags
}

$parsed = Parse-BootstrapArgs $args
$manifest = Get-Manifest
Ensure-Elevation $manifest $parsed.command $args $parsed.flags
Unblock-ToolkitPowerShellFiles
$report = Initialize-Report $manifest $parsed.command $parsed.flags

try {
    switch ($parsed.command) {
        'doctor' { Invoke-DoctorOnly $manifest $report $parsed.flags }
        'verify' { Invoke-DoctorOnly $manifest $report $parsed.flags }
        'fix' {
            if (-not $parsed.flags['allow-installs']) { Add-ReportEntry $report skipped 'Install phase' '' '' '' 'flags' 'skipped' 'Automatic installs disabled by flag' }
            else { Ensure-Git $report; Ensure-Node $manifest $report; Ensure-PyenvNative $manifest $report; Ensure-PyenvGui $manifest $report; Ensure-PythonRuntime $manifest $report $parsed.flags | Out-Null; Ensure-OptionalWindowsTools $manifest $report $parsed.flags; Ensure-PythonPlaywright $manifest $report $parsed.flags }
            Add-WorkspaceReadinessEntries $report $parsed.flags
            Invoke-NodeDoctorIfAvailable $report $parsed.flags
        }
        'prepare-host' {
            if (-not $parsed.flags['allow-installs']) { Add-ReportEntry $report skipped 'Install phase' '' '' '' 'flags' 'skipped' 'Automatic installs disabled by flag' }
            else { Ensure-Git $report; Ensure-Node $manifest $report; Ensure-PyenvNative $manifest $report; Ensure-PyenvGui $manifest $report; Ensure-PythonRuntime $manifest $report $parsed.flags | Out-Null; Ensure-OptionalWindowsTools $manifest $report $parsed.flags; Ensure-PythonPlaywright $manifest $report $parsed.flags }
            Add-WorkspaceReadinessEntries $report $parsed.flags
            Invoke-NodeDoctorIfAvailable $report $parsed.flags
        }
        default { throw "Unknown bootstrap command: $($parsed.command)" }
    }
} catch {
    Add-ReportEntry $report failed 'Bootstrap runtime' '' '' '' 'bootstrap.ps1' 'failed' $_.Exception.Message
}

Save-Report $report $parsed.flags.json

$exitCode = if ($report.results.failed.Count -gt 0) { 2 } else { 0 }

if ($args -contains $ElevationMarker) {
    Write-Host "`nPress any key to close this window..."
    $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') | Out-Null
}

exit $exitCode
