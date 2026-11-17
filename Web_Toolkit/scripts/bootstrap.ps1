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

. (Join-Path $PSScriptRoot 'lib\host-tools.ps1')

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
    
    if (Test-NodeNeedsInstall $Manifest) { return $true }

    # pnpm installs in user scope (no admin), so a missing pnpm never triggers the UAC prompt on its own.
    $enchiRequired = Get-ManifestValue $Manifest 'tool.enchi.minimum_version' '0.8.0'
    $enchiVersion = Get-EnchiVersion
    if (-not $enchiVersion -or (Compare-Version $enchiVersion $enchiRequired) -lt 0) { return $true }
    
    $pythonRequired = Get-ManifestValue $Manifest 'tool.python.minimum_version'
    $pythonVersion = Get-CommandVersion 'python'
    if (-not $pythonVersion -or (Compare-Version $pythonVersion $pythonRequired) -lt 0) { return $true }
    
    $workspace = $Flags.workspace
    $venvName = ConvertTo-NormalizedEnvName (Split-Path -Leaf $workspace)
    $desiredVersion = Resolve-DesiredPythonVersion $Manifest
    try {
        $versionsOutput = (Invoke-Enchi -Arguments @('versions') 2>$null) -join "`n"
        if ($versionsOutput -notmatch [Regex]::Escape($desiredVersion)) { return $true }
        $targetSpec = "$desiredVersion/envs/$venvName"
        if ($versionsOutput -notmatch [Regex]::Escape($targetSpec)) { return $true }
    } catch { return $true }

    if ($Flags['install-python-playwright']) {
        try {
            $playwrightVersion = (Invoke-Enchi -Arguments @('exec', 'python', '-m', 'playwright', '--version') -WorkingDirectory $workspace 2>$null | Select-Object -First 1).Trim()
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


function Ensure-Git([hashtable]$Report) {
    $before = Get-CommandVersion 'git'
    if ($before) { Add-ReportEntry $Report current 'Git' '' $before $before 'PATH' 'already-current' 'Git already available'; return }
    try { Invoke-WingetEnsurePackage 'Git.Git' 'Git'; $after = Get-CommandVersion 'git'; if ($after) { Add-ReportEntry $Report installed 'Git' '' $before $after 'winget:Git.Git' 'installed' 'Installed Git via winget'; return } } catch {}
    Add-ReportEntry $Report failed 'Git' '' $before '' 'winget:Git.Git' 'failed' 'Git still missing after install attempt' 'Install Git manually and rerun bootstrap.'
}

# --- Node: the required MAJOR is the repo-root .node-version (a major or a full version; only the major counts), else the
# manifest. The release is the latest of that major on nodejs.org, read from its own checksum file: nothing here names a version.

# True when Node must be installed or updated: below the required major, or (when nodejs.org answers) behind that major's
# latest release. A newer major than required is accepted; being offline never forces an update.

function Install-NodeMsi($Latest) {
    $msi = Join-Path $env:TEMP $Latest.File
    try {
        Invoke-WebRequest -Uri $Latest.Url -OutFile $msi -UseBasicParsing
        $actual = (Get-FileHash -LiteralPath $msi -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $Latest.Sha256) { throw "Checksum mismatch for $($Latest.File); not installing it." }
        $process = Start-Process -FilePath msiexec.exe -ArgumentList @('/i', "`"$msi`"", '/qn', '/norestart') -Wait -PassThru
        if ($process.ExitCode -notin @(0, 3010)) { throw "msiexec exited with code $($process.ExitCode)." }
    } finally { Remove-Item -LiteralPath $msi -Force -ErrorAction SilentlyContinue }
}

function Ensure-Node($Manifest, [hashtable]$Report) {
    $major = Get-NodeMajor $Manifest
    $required = "$major.x (latest)"
    $before = Get-CommandVersion 'node'
    if (-not (Test-NodeNeedsInstall $Manifest)) {
        Add-ReportEntry $Report current 'Node.js' $required $before $before 'PATH' 'already-current' "Node $before satisfies the Node $major line"
        foreach ($tool in @('npm','npx')) { $version = Get-CommandVersion $tool; Add-ReportEntry $Report current $tool '' $version $version 'Node bundle' 'already-current' "$tool available with Node" }
        return
    }
    $latest = Resolve-LatestNode $Manifest
    $packageId = Get-ManifestValue $Manifest 'tool.node.windows.package_id'
    $source = 'nodejs.org'
    $installed = $false
    $problem = ''
    if ($latest) {
        try { Install-NodeMsi $latest; $installed = $true } catch { $problem = $_.Exception.Message }
    } else { $problem = 'Could not read the latest Node release list from nodejs.org.' }
    if (-not $installed) {
        try { Invoke-WingetEnsurePackage $packageId 'Node.js'; $installed = $true; $source = "winget:$packageId" }
        catch { Add-ReportEntry $Report failed 'Node.js' $required $before '' 'nodejs.org' 'failed' "$problem $($_.Exception.Message)".Trim() 'Install the latest Node release for your major from nodejs.org, then rerun bootstrap.'; return }
    }
    Add-PathEntry (Join-Path $env:ProgramFiles 'nodejs')
    $after = Get-CommandVersion 'node'
    if ($after -and (Compare-Version $after "$major.0.0") -ge 0) {
        Add-ReportEntry $Report installed 'Node.js' $required $before $after $source 'installed-or-updated' "Installed Node $after ($major line)"
        foreach ($tool in @('npm','npx')) { $version = Get-CommandVersion $tool; Add-ReportEntry $Report installed $tool '' '' $version 'Node bundle' 'available' "$tool available after Node install" }
        return
    }
    Add-ReportEntry $Report failed 'Node.js' $required $before $after $source 'failed' "Node did not satisfy the Node $major line after install" 'Open a new terminal or install the latest Node release manually, then rerun bootstrap.'
}

# --- pnpm: the toolkit's package manager, installed when missing (user scope, no admin): winget, then the official installer.

function Ensure-Pnpm($Manifest, [hashtable]$Report) {
    $required = Get-ManifestValue $Manifest 'tool.pnpm.minimum_version' '10.0.0'
    $before = Get-PnpmVersion
    if ($before -and (Compare-Version $before $required) -ge 0) { Add-ReportEntry $Report current 'pnpm' ">= $required" $before $before 'PATH' 'already-current' "pnpm $before is the toolkit package manager"; return }
    if ($before) { try { & pnpm self-update 2>$null | Out-Null } catch {} }
    $after = Get-PnpmVersion
    if (-not $after -or (Compare-Version $after $required) -lt 0) {
        $packageId = Get-ManifestValue $Manifest 'tool.pnpm.windows.package_id' 'pnpm.pnpm'
        try { Invoke-WingetEnsurePackage $packageId 'pnpm' } catch {
            try {
                $script = Join-Path $env:TEMP 'pnpm-install.ps1'
                Invoke-WebRequest -Uri (Get-ManifestValue $Manifest 'tool.pnpm.windows.install_url' 'https://get.pnpm.io/install.ps1') -OutFile $script -UseBasicParsing
                & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script | Out-Null
                Remove-Item -LiteralPath $script -Force -ErrorAction SilentlyContinue
            } catch {}
        }
        $after = Get-PnpmVersion
    }
    if ($after -and (Compare-Version $after $required) -ge 0) { Add-ReportEntry $Report installed 'pnpm' ">= $required" $before $after 'winget/get.pnpm.io' 'installed-or-updated' 'pnpm ready; open a new terminal if `pnpm` is not found' }
    else { Add-ReportEntry $Report failed 'pnpm' ">= $required" $before $after 'winget/get.pnpm.io' 'failed' 'pnpm could not be installed' 'Run: npm install --global pnpm, then rerun bootstrap.' }
}

# --- Enchi (formerly pyenv-native, renamed in 0.8.0): CLI enchi.exe, root %USERPROFILE%\.enchi or an existing .pyenv upgraded
# in place. A machine that has not upgraded yet still has pyenv.exe, so both names and both roots are looked up.

# The parameter is NOT called $Args: that is PowerShell's automatic variable, and a parameter of that name silently drops every
# argument (enchi then prints its help, and a failed install looks like success).
function Invoke-Enchi([string[]]$Arguments, [string]$WorkingDirectory = '') {
    $enchi = Resolve-EnchiCommand
    if (-not $enchi) { throw 'Enchi is not available in PATH.' }
    Add-EnchiToPath
    if ($WorkingDirectory) { Push-Location $WorkingDirectory; try { & $enchi @Arguments } finally { Pop-Location } } else { & $enchi @Arguments }
}

function Install-Enchi($Manifest) {
    $url = Get-ManifestValue $Manifest 'tool.enchi.windows.install_url'
    $tempPath = Join-Path $env:TEMP 'enchi-install.ps1'
    Invoke-WebRequest -Uri $url -OutFile $tempPath -UseBasicParsing
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tempPath
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    Add-EnchiToPath
}

function Ensure-Enchi($Manifest, [hashtable]$Report) {
    $required = Get-ManifestValue $Manifest 'tool.enchi.minimum_version' '0.8.0'
    Add-EnchiToPath
    $before = Get-EnchiVersion
    try {
        if ($before -and (Compare-Version $before $required) -ge 0) { Add-ReportEntry $Report current 'Enchi' $required $before $before 'PATH' 'already-current' 'Enchi CLI satisfies policy'; return }
        if ($before) { try { Invoke-Enchi -Arguments @('self-update') | Out-Null } catch {} }
        $after = Get-EnchiVersion
        if (-not $after -or (Compare-Version $after $required) -lt 0) { Install-Enchi $Manifest; $after = Get-EnchiVersion }
        if ($after -and (Compare-Version $after $required) -ge 0) { Add-ReportEntry $Report installed 'Enchi' $required $before $after 'github-release-installer/self-update' 'installed-or-updated' 'Enchi CLI ready; use `enchi` / `enchi gui`'; return }
    } catch {
        Add-ReportEntry $Report failed 'Enchi' $required $before '' 'github-release-installer/self-update' 'failed' $_.Exception.Message 'Install Enchi from the latest GitHub release (imyourboyroy/pyenv-native) and rerun bootstrap.'
        return
    }
    Add-ReportEntry $Report failed 'Enchi' $required $before (Get-EnchiVersion) 'github-release-installer/self-update' 'failed' 'Enchi did not satisfy policy after install/update' 'Install Enchi from the latest GitHub release (imyourboyroy/pyenv-native) and rerun bootstrap.'
}

function Ensure-EnchiGui($Manifest, [hashtable]$Report) {
    Add-EnchiToPath
    $before = if (Test-EnchiGuiAvailable) { 'present' } else { '' }
    if ($before) { Add-ReportEntry $Report current 'Enchi GUI' '' $before $before 'enchi' 'already-current' 'Enchi GUI available; launch with `enchi gui`'; return }
    try {
        if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { throw 'There is no Enchi GUI build for Windows on ARM yet.' }
        $base = Get-ManifestValue $Manifest 'tool.enchi.release_base' 'https://github.com/imyourboyroy/pyenv-native/releases/latest/download'
        $url = "$base/enchi-gui-windows-x64.exe"
        $enchi = Resolve-EnchiCommand
        $targetDir = if ($enchi) { Split-Path -Parent $enchi } else { Join-Path $env:USERPROFILE '.enchi\bin' }
        $targetPath = Join-Path $targetDir (Get-ManifestValue $Manifest 'tool.enchi_gui.binary_name.windows' 'enchi-gui.exe')
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
        $expected = ((Get-WebText "$url.sha256") -split '\s+' | Where-Object { $_ } | Select-Object -First 1).ToLowerInvariant()
        Invoke-WebRequest -Uri $url -OutFile "$targetPath.part" -UseBasicParsing
        $actual = (Get-FileHash -LiteralPath "$targetPath.part" -Algorithm SHA256).Hash.ToLowerInvariant()
        if (-not $expected -or $actual -ne $expected) { Remove-Item -LiteralPath "$targetPath.part" -Force -ErrorAction SilentlyContinue; throw 'The Enchi GUI download did not match its published checksum.' }
        Move-Item -LiteralPath "$targetPath.part" -Destination $targetPath -Force
        Unblock-File -LiteralPath $targetPath -ErrorAction SilentlyContinue
        Add-EnchiToPath
        Add-ReportEntry $Report installed 'Enchi GUI' '' $before 'present' 'github-release' 'installed' 'Enchi GUI installed; launch with `enchi gui`'
    } catch {
        Add-ReportEntry $Report failed 'Enchi GUI' '' $before '' 'github-release' 'failed' $_.Exception.Message 'Download enchi-gui-windows-x64.exe from the Enchi release assets into %USERPROFILE%\.enchi\bin, then run `enchi gui`.'
    }
}

function Resolve-DesiredPythonVersion($Manifest) {
    $prefix = Get-ManifestValue $Manifest 'tool.python.desired_prefix'
    $fallback = Get-ManifestValue $Manifest 'tool.python.fallback_version'
    try { $resolved = (Invoke-Enchi -Arguments @('latest', $prefix) 2>$null | Select-Object -First 1).Trim(); if ($resolved) { return $resolved } } catch {}
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
        $versionsOutput = (Invoke-Enchi -Arguments @('versions')) -join "`n"
        if ($versionsOutput -notmatch [Regex]::Escape($desiredVersion)) { Invoke-Enchi -Arguments @('install', $desiredVersion) | Out-Null; $versionsOutput = (Invoke-Enchi -Arguments @('versions')) -join "`n" }
        # Prefer the desired line as the user-global Python (latest installed for that prefix).
        try { Invoke-Enchi -Arguments @('global', $desiredVersion) | Out-Null } catch { }
        $targetSpec = "$desiredVersion/envs/$venvName"
        if ($versionsOutput -notmatch [Regex]::Escape($targetSpec)) { Invoke-Enchi -Arguments @('venv', 'create', $desiredVersion, $venvName) | Out-Null }
        Invoke-Enchi -Arguments @('local', $targetSpec) -WorkingDirectory $workspace | Out-Null
        Invoke-Enchi -Arguments @('exec', 'python', '-m', 'pip', 'install', '--upgrade', 'pip') -WorkingDirectory $workspace | Out-Null
        $afterPython = (Invoke-Enchi -Arguments @('exec', 'python', '--version') -WorkingDirectory $workspace | Select-Object -First 1).Trim()
        $afterPip = (Invoke-Enchi -Arguments @('exec', 'python', '-m', 'pip', '--version') -WorkingDirectory $workspace | Select-Object -First 1).Trim()
        Add-ReportEntry $Report installed 'Python runtime' $required $beforePython $afterPython 'enchi' 'installed-or-selected' "Workspace bound to $targetSpec; Enchi global set to $desiredVersion"
        Add-ReportEntry $Report installed 'pip' '' $beforePip $afterPip 'enchi' 'installed-or-updated' 'pip upgraded inside the managed venv'
        return
    } catch {
        Add-ReportEntry $Report failed 'Python runtime' $required $beforePython '' 'enchi' 'failed' $_.Exception.Message 'Run enchi doctor, ensure shell integration is healthy, and rerun bootstrap.'
    }
}

function Ensure-PythonPlaywright($Manifest, [hashtable]$Report, [hashtable]$Flags) {
    if (-not $Flags['install-python-playwright']) { Add-ReportEntry $Report skipped 'Python Playwright' '' '' '' 'enchi venv' 'skipped' 'Flag disabled'; return }
    try { $before = (Invoke-Enchi -Arguments @('exec', 'python', '-m', 'playwright', '--version') -WorkingDirectory $Flags.workspace | Select-Object -First 1).Trim() } catch { $before = '' }
    if ($before) { Add-ReportEntry $Report current 'Python Playwright' '' $before $before 'enchi venv' 'already-current' 'Playwright already installed in the managed venv'; return }
    try {
        $package = Get-ManifestValue $Manifest 'tool.python_playwright.package' 'playwright'
        $browser = Get-ManifestValue $Manifest 'tool.python_playwright.browser' 'chromium'
        Invoke-Enchi -Arguments @('exec', 'python', '-m', 'pip', 'install', $package) -WorkingDirectory $Flags.workspace | Out-Null
        Invoke-Enchi -Arguments @('exec', 'python', '-m', 'playwright', 'install', $browser) -WorkingDirectory $Flags.workspace | Out-Null
        $after = (Invoke-Enchi -Arguments @('exec', 'python', '-m', 'playwright', '--version') -WorkingDirectory $Flags.workspace | Select-Object -First 1).Trim()
        Add-ReportEntry $Report installed 'Python Playwright' '' $before $after 'enchi venv' 'installed' "Installed $package + $browser"
    } catch {
        Add-ReportEntry $Report failed 'Python Playwright' '' $before '' 'enchi venv' 'failed' $_.Exception.Message 'Retry browser automation installation after confirming the managed venv is healthy.'
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
    $nodeMajor = Get-NodeMajor $Manifest
    $nodeVersion = Get-CommandVersion 'node'
    $pnpmRequired = Get-ManifestValue $Manifest 'tool.pnpm.minimum_version' '10.0.0'
    # Doctor never touches the network: it checks the Node major floor; prepare-host also brings that major to its latest release.
    foreach ($pair in @(
        @{ name = 'Git'; version = (Get-CommandVersion 'git'); required = '' ; details = 'Git available' },
        @{ name = 'Node.js'; version = $nodeVersion; required = "$nodeMajor.0.0"; details = "Node missing or below the required major ($nodeMajor)" },
        @{ name = 'pnpm'; version = (Get-PnpmVersion); required = $pnpmRequired; details = 'pnpm missing or too old; it is the toolkit package manager. Run prepare-host to install it' },
        @{ name = 'Enchi'; version = (Get-EnchiVersion); required = (Get-ManifestValue $Manifest 'tool.enchi.minimum_version' '0.8.0'); details = 'Enchi (formerly pyenv-native) missing or below the minimum; prepare-host installs or upgrades it. Do not use system Python' },
        @{ name = 'Enchi GUI'; version = $(if (Test-EnchiGuiAvailable) { 'present' } else { '' }); required = ''; details = 'Enchi GUI missing; launch via `enchi gui`' },
        @{ name = 'Python runtime'; version = (Get-CommandVersion 'python'); required = (Get-ManifestValue $Manifest 'tool.python.minimum_version'); details = 'Python executable not found under Enchi' },
        @{ name = 'pip'; version = (Get-CommandVersion 'pip'); required = ''; details = 'pip not found under the Enchi venv' }
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
            else { Ensure-Git $report; Ensure-Node $manifest $report; Ensure-Pnpm $manifest $report; Ensure-Enchi $manifest $report; Ensure-EnchiGui $manifest $report; Ensure-PythonRuntime $manifest $report $parsed.flags | Out-Null; Ensure-OptionalWindowsTools $manifest $report $parsed.flags; Ensure-PythonPlaywright $manifest $report $parsed.flags }
            Add-WorkspaceReadinessEntries $report $parsed.flags
            Invoke-NodeDoctorIfAvailable $report $parsed.flags
        }
        'prepare-host' {
            if (-not $parsed.flags['allow-installs']) { Add-ReportEntry $report skipped 'Install phase' '' '' '' 'flags' 'skipped' 'Automatic installs disabled by flag' }
            else { Ensure-Git $report; Ensure-Node $manifest $report; Ensure-Pnpm $manifest $report; Ensure-Enchi $manifest $report; Ensure-EnchiGui $manifest $report; Ensure-PythonRuntime $manifest $report $parsed.flags | Out-Null; Ensure-OptionalWindowsTools $manifest $report $parsed.flags; Ensure-PythonPlaywright $manifest $report $parsed.flags }
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
