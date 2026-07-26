# Compatibility wrapper. This command reports status and never mutates.
[CmdletBinding()]
param(
    [ValidateSet(
        'codex', 'cursor', 'claude', 'gemini', 'antigravity', 'antigravity-cli',
        'copilot', 'kiro', 'all'
    )]
    [string]$Agent = 'all',

    [ValidateSet('user', 'project')]
    [string]$Scope = 'user',

    [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$arguments = @((Join-Path $PSScriptRoot 'update-toolkit.mjs'), '--scope', $Scope)
if ($Agent -ne 'all') { $arguments += @('--agent', $Agent) }
if ($Apply) { $arguments += '--apply' }
& node @arguments
exit $LASTEXITCODE
