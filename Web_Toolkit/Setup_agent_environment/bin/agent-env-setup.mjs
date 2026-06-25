#!/usr/bin/env node
// ./Web_Toolkit/Setup_agent_environment/bin/agent-env-setup.mjs
/**
 * CLI entrypoint for the portable agent-environment setup tool.
 *
 * Validates and optionally repairs the host environment needed for Codex,
 * Antigravity, Astro/Node projects, and common website automation workflows.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runDoctor, runFix, runPrepareHost, runVerify } from '../src/commands/setup.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'agent-env-setup',
    summary: 'Portable host environment setup for Codex / Antigravity',
    usage: [
      'agent-env-setup doctor --workspace <path> [--json]',
      'agent-env-setup verify --workspace <path>',
      'powershell -NoProfile -ExecutionPolicy Bypass -File ./Web_Toolkit/scripts/bootstrap.ps1 prepare-host --workspace <path>',
      'bash ./Web_Toolkit/scripts/bootstrap.sh prepare-host --workspace <path>'
    ],
    commands: [
      { name: 'doctor', description: 'Read-only host and workspace diagnostics after native bootstrap has provisioned the machine.' },
      { name: 'verify', description: 'Re-run the doctor flow with human-readable output for a final readiness pass.' },
      { name: 'fix (deprecated)', description: 'Deprecated. Use the OS-native bootstrap wrappers instead of the Node CLI for installs.' },
      { name: 'prepare-host (deprecated)', description: 'Deprecated. Use the OS-native bootstrap wrappers instead of the Node CLI for installs.' }
    ],
    flags: [
      { name: '--workspace <path>', description: 'Target repo/workspace root to inspect for README, AGENTS, MEMORY, package.json, Astro config, and preview/test scripts.' },
      { name: '--json', description: 'Emit machine-readable JSON instead of formatted console output.' },
      { name: '--skip-workspace-checks', description: 'Only inspect machine tooling and skip project-root readiness checks.' },
      { name: '--allow-installs <true|false>', description: 'Permit or block automatic package installs during fix/prepare-host. Defaults to true.' },
      { name: '--install-optional-tools <true|false>', description: 'Install recommended extras like pnpm, Bun, uv, gh, and dotnet when missing. Defaults to true.' },
      { name: '--install-python-playwright <true|false>', description: 'Install Python Playwright + Chromium when Python/pip exist but browser automation support is missing.' }
    ],
    examples: [
      'agent-env-setup doctor --workspace C:/sites/client-app',
      'agent-env-setup fix --workspace C:/sites/client-app',
      'agent-env-setup prepare-host --workspace C:/sites/client-app'
    ],
    notes: [
      'Native bootstrap wrappers are now the only supported install/repair path.',
      'This Node CLI is retained for post-bootstrap read-only diagnostics.',
      'Required baseline: Git, Node 26+, pyenv-native 0.2.9+, Python 3.13+, and pip inside the pyenv-managed workspace venv.'
    ],
    exitCodes: [
      { name: '0', description: 'Healthy or successfully repaired.' },
      { name: '2', description: 'Warnings remain, such as missing required tooling or partial repair support.' },
      { name: '1', description: 'Unhandled failure.' }
    ]
  });
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const primary = String(command[0] || 'help').toLowerCase();
  if (['help', '--help', '-h'].includes(primary)) {
    printHelp();
    return 0;
  }
  if (primary === 'doctor') return runDoctor(flags);
  if (primary === 'fix') return runFix(flags);
  if (primary === 'verify') return runVerify(flags);
  if (primary === 'prepare-host') return runPrepareHost(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[agent-env-setup] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

