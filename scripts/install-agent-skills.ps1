# Compatibility wrapper. This command is intentionally read-only.
[CmdletBinding()]
param(
    [ValidateSet(
        'codex', 'cursor', 'claude', 'gemini', 'antigravity', 'antigravity-cli',
        'copilot', 'kiro', 'all'
    )]
    [string]$Agent = 'all',

    [ValidateSet('user', 'project')]
    [string]$Scope = 'user',

    [string]$Project = '',

    [switch]$ShowPaths,

    [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node is unavailable. Follow docs/agent-skills/INSTALL_PROTOCOL.md manually.'
}

$arguments = @(
    (Join-Path $PSScriptRoot 'check-agent-skills.mjs'),
    '--scope', $Scope
)
if ($Agent -ne 'all') { $arguments += @('--agent', $Agent) }
if ($Project) { $arguments += @('--project', $Project) }
if ($ShowPaths) { $arguments += '--show-paths' }
if ($Apply) { $arguments += '--apply' }

& node @arguments
exit $LASTEXITCODE
