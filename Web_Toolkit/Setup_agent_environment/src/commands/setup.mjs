// ./Web_Toolkit/Setup_agent_environment/src/commands/setup.mjs
/**
 * Host environment doctor/fix/verify flows for Codex, Antigravity, and web work.
 *
 * The setup path is intentionally split in two layers:
 * 1. Native bootstrap wrappers install/repair Node and request elevation early.
 * 2. This Node-based command performs version-aware host checks and installs
 *    the remaining required/recommended tooling without redoing satisfied work.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { commandAvailable, runCommand } from '../lib/exec.mjs';
import { prettyJson, printCheck, printSection, toBool } from '../lib/format.mjs';
import { loadPortableEnv } from '../lib/env.mjs';

const DEFAULT_NODE_RANGE = '>=26';
const REQUIRED_TOOL_KEYS = ['git', 'node', 'npm', 'npx', 'python', 'pip'];
const OPTIONAL_INSTALL_TOOL_KEYS = ['pnpm', 'bun', 'uv', 'gh', 'dotnet'];

const WINDOWS_PACKAGES = {
  git: { id: 'Git.Git', label: 'Git' },
  node: { id: 'OpenJS.NodeJS.LTS', currentId: 'OpenJS.NodeJS', label: 'Node.js' },
  python: { id: 'Python.Python.3.14', label: 'Python 3.14' },
  gh: { id: 'GitHub.cli', label: 'GitHub CLI' },
  dotnet: { id: 'Microsoft.DotNet.SDK.10', label: '.NET SDK 10' },
  bun: { id: 'Oven-sh.Bun', label: 'Bun' },
  uv: { id: 'astral-sh.uv', label: 'uv' },
  pnpm: { id: 'pnpm.pnpm', label: 'pnpm' }
};

const MACOS_PACKAGES = {
  git: { args: ['install', 'git'], label: 'Git' },
  node: { args: ['install', 'node'], label: 'Node.js' },
  python: { args: ['install', 'python@3.14'], fallbackArgs: ['install', 'python'], label: 'Python 3.14+' },
  gh: { args: ['install', 'gh'], label: 'GitHub CLI' },
  dotnet: { args: ['install', '--cask', 'dotnet-sdk'], label: '.NET SDK' },
  bun: { args: ['install', 'bun'], label: 'Bun' },
  uv: { args: ['install', 'uv'], label: 'uv' },
  pnpm: { args: ['install', 'pnpm'], label: 'pnpm' }
};

const TOOL_RULES = {
  git: { label: 'Git', required: true, minimum: '>=2.40.0' },
  node: { label: 'Node.js', required: true, minimum: DEFAULT_NODE_RANGE },
  npm: { label: 'npm', required: true, minimum: '>=10.0.0' },
  npx: { label: 'npx', required: true, minimum: '>=10.0.0' },
  corepack: { label: 'corepack', required: false, minimum: '>=0.25.0' },
  pnpm: { label: 'pnpm', required: false, minimum: '>=9.0.0' },
  bun: { label: 'Bun', required: false, minimum: '>=1.1.0' },
  python: { label: 'Python', required: true, minimum: '>=3.13.0' },
  pip: { label: 'pip', required: true, minimum: '>=23.0.0' },
  pyenv: { label: 'pyenv', required: false, minimum: '' },
  pythonPlaywright: { label: 'Python Playwright', required: false, minimum: '>=1.61.0' },
  uv: { label: 'uv', required: false, minimum: '>=0.4.0' },
  dotnet: { label: '.NET SDK', required: false, minimum: '>=8.0.0' },
  gh: { label: 'GitHub CLI', required: false, minimum: '>=2.45.0' }
};

function workspaceRoot(flags = {}) {
  const env = loadPortableEnv();
  return path.resolve(String(flags.workspace || env.PORTABLE_DEFAULT_PROJECT_ROOT || process.cwd()));
}

function parseVersion(value = '') {
  const match = String(value || '').match(/(\d+)\.(\d+)\.(\d+)/);
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
  const twoPart = String(value || '').match(/(\d+)\.(\d+)/);
  if (twoPart) return [Number(twoPart[1]), Number(twoPart[2]), 0];
  const onePart = String(value || '').match(/(\d+)/);
  if (onePart) return [Number(onePart[1]), 0, 0];
  return [0, 0, 0];
}

function compareVersions(left = '0.0.0', right = '0.0.0') {
  const [lMaj, lMin, lPatch] = parseVersion(left);
  const [rMaj, rMin, rPatch] = parseVersion(right);
  if (lMaj !== rMaj) return lMaj > rMaj ? 1 : -1;
  if (lMin !== rMin) return lMin > rMin ? 1 : -1;
  if (lPatch !== rPatch) return lPatch > rPatch ? 1 : -1;
  return 0;
}

function incrementVersion(version = '0.0.0', mode = 'patch') {
  const [maj, min, patch] = parseVersion(version);
  if (mode === 'major') return `${maj + 1}.0.0`;
  if (mode === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${patch + 1}`;
}

function normalizeRequirement(requirement = '') {
  const trimmed = String(requirement || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\s+/g, ' ').trim();
}

function comparatorPasses(actual, comparator) {
  const token = String(comparator || '').trim();
  if (!token || token === '*') return true;

  if (token.startsWith('^')) {
    const base = token.slice(1);
    return compareVersions(actual, base) >= 0 && compareVersions(actual, incrementVersion(base, 'major')) < 0;
  }
  if (token.startsWith('~')) {
    const base = token.slice(1);
    return compareVersions(actual, base) >= 0 && compareVersions(actual, incrementVersion(base, 'minor')) < 0;
  }

  const match = token.match(/^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+){0,2})$/);
  if (!match) return true;
  const operator = match[1] || '=';
  const target = match[2];
  const comparison = compareVersions(actual, target);
  if (operator === '>=') return comparison >= 0;
  if (operator === '<=') return comparison <= 0;
  if (operator === '>') return comparison > 0;
  if (operator === '<') return comparison < 0;
  return comparison === 0;
}

function requirementSatisfied(actual, requirement = '') {
  if (!actual) return false;
  const normalized = normalizeRequirement(requirement);
  const groups = normalized.split('||').map((entry) => entry.trim()).filter(Boolean);
  if (groups.length === 0) return true;
  return groups.some((group) => group.split(' ').filter(Boolean).every((token) => comparatorPasses(actual, token)));
}

function formatRequirementStatus(actual, requirement = '') {
  if (!actual) return 'missing';
  return `${actual} (${requirementSatisfied(actual, requirement) ? 'meets' : 'needs'} ${normalizeRequirement(requirement)})`;
}

function safeVersion(command, args = ['--version']) {
  try {
    const result = runCommand(command, args, { throwOnError: false });
    if (result.status !== 0) return '';
    return (result.stdout || result.stderr || '').trim().split(/\r?\n/)[0] || '';
  } catch {
    return '';
  }
}

function safeCommand(command, args = []) {
  try {
    const result = runCommand(command, args, { throwOnError: false });
    return {
      ok: result.status === 0,
      stdout: String(result.stdout || '').trim(),
      stderr: String(result.stderr || '').trim()
    };
  } catch {
    return { ok: false, stdout: '', stderr: '' };
  }
}

function resolvePythonSpec() {
  const attempts = process.platform === 'win32'
    ? [
        { command: 'python', argsPrefix: [], label: 'python' },
        { command: 'py', argsPrefix: ['-3'], label: 'py -3' }
      ]
    : [
        { command: 'python3', argsPrefix: [], label: 'python3' },
        { command: 'python', argsPrefix: [], label: 'python' }
      ];

  for (const attempt of attempts) {
    const versionResult = safeCommand(attempt.command, [...attempt.argsPrefix, '--version']);
    if (!versionResult.ok) continue;
    const executableResult = safeCommand(attempt.command, [...attempt.argsPrefix, '-c', 'import sys; print(sys.executable)']);
    const pipResult = safeCommand(attempt.command, [...attempt.argsPrefix, '-m', 'pip', '--version']);
    const playwrightResult = safeCommand(attempt.command, [...attempt.argsPrefix, '-m', 'playwright', '--version']);
    return {
      ok: true,
      command: attempt.command,
      argsPrefix: attempt.argsPrefix,
      label: attempt.label,
      version: versionResult.stdout || versionResult.stderr,
      executable: executableResult.stdout || '',
      pipVersion: pipResult.ok ? (pipResult.stdout || pipResult.stderr) : '',
      playwrightVersion: playwrightResult.ok ? (playwrightResult.stdout || playwrightResult.stderr) : ''
    };
  }

  return {
    ok: false,
    command: '',
    argsPrefix: [],
    label: '',
    version: '',
    executable: '',
    pipVersion: '',
    playwrightVersion: ''
  };
}

function pyenvGlobal() {
  try {
    const result = runCommand('pyenv', ['global'], { throwOnError: false });
    return result.status === 0 ? result.stdout.trim() : '';
  } catch {
    return '';
  }
}

function workspaceChecks(root) {
  const packageJsonPath = path.join(root, 'package.json');
  const packageJson = fs.existsSync(packageJsonPath)
    ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    : null;
  const hasMemory = fs.existsSync(path.join(root, 'MEMORY.md')) || fs.existsSync(path.join(root, 'memory.md'));
  return {
    root,
    exists: fs.existsSync(root),
    hasGitRepo: fs.existsSync(path.join(root, '.git')),
    hasAgents: fs.existsSync(path.join(root, 'AGENTS.md')),
    hasReadme: fs.existsSync(path.join(root, 'README.md')),
    hasMemory,
    hasEnvExample: fs.existsSync(path.join(root, '.env.example')),
    hasPackageJson: Boolean(packageJson),
    hasPreviewScript: Boolean(packageJson?.scripts?.preview || packageJson?.scripts?.dev),
    hasTestScript: Boolean(packageJson?.scripts?.test || packageJson?.scripts?.check),
    hasAstroConfig: ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.cjs'].some((name) => fs.existsSync(path.join(root, name)))
  };
}

function getRequiredNodeRange(root) {
  try {
    const pkgPath = path.join(root, 'package.json');
    if (!fs.existsSync(pkgPath)) return DEFAULT_NODE_RANGE;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return normalizeRequirement(pkg?.engines?.node || DEFAULT_NODE_RANGE);
  } catch {
    return DEFAULT_NODE_RANGE;
  }
}

function linuxPackageManager() {
  const candidates = [
    { key: 'apt', command: 'apt-get', installArgs: ['install', '-y'], refreshArgs: ['update'], packages: { git: ['git'], node: ['nodejs', 'npm'], python: ['python3', 'python3-pip'], gh: ['gh'], dotnet: ['dotnet-sdk-8.0'], bun: ['bun'], uv: ['uv'], pnpm: ['pnpm'] } },
    { key: 'dnf', command: 'dnf', installArgs: ['install', '-y'], refreshArgs: ['makecache'], packages: { git: ['git'], node: ['nodejs', 'npm'], python: ['python3', 'python3-pip'], gh: ['gh'], dotnet: ['dotnet-sdk-8.0'], bun: ['bun'], uv: ['uv'], pnpm: ['pnpm'] } },
    { key: 'yum', command: 'yum', installArgs: ['install', '-y'], refreshArgs: ['makecache'], packages: { git: ['git'], node: ['nodejs', 'npm'], python: ['python3', 'python3-pip'], gh: ['gh'], dotnet: ['dotnet-sdk-8.0'], bun: ['bun'], uv: ['uv'], pnpm: ['pnpm'] } },
    { key: 'pacman', command: 'pacman', installArgs: ['-S', '--noconfirm'], refreshArgs: ['-Sy'], packages: { git: ['git'], node: ['nodejs', 'npm'], python: ['python', 'python-pip'], gh: ['github-cli'], dotnet: ['dotnet-sdk'], bun: ['bun'], uv: ['uv'], pnpm: ['pnpm'] } },
    { key: 'zypper', command: 'zypper', installArgs: ['install', '-y'], refreshArgs: ['refresh'], packages: { git: ['git'], node: ['nodejs', 'npm'], python: ['python311', 'python311-pip'], gh: ['gh'], dotnet: ['dotnet-sdk-8.0'], bun: ['bun'], uv: ['uv'], pnpm: ['pnpm'] } }
  ];
  return candidates.find((candidate) => commandAvailable(candidate.command, ['--version'])) || null;
}

function isElevated() {
  if (process.platform === 'win32') {
    const result = safeCommand('powershell', ['-NoProfile', '-Command', '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)']);
    return result.ok && /true/i.test(result.stdout);
  }
  if (typeof process.getuid === 'function') return process.getuid() === 0;
  return false;
}

function sudoArgs(args = []) {
  if (process.platform === 'win32' || isElevated() || !commandAvailable('sudo', ['--version'])) return { command: '', args };
  return { command: 'sudo', args };
}

function collectChecks(flags = {}) {
  const root = workspaceRoot(flags);
  const python = resolvePythonSpec();
  const nodeRequirement = getRequiredNodeRange(root);
  const currentNode = safeVersion('node');
  const platform = process.platform;
  const linuxManager = platform === 'linux' ? linuxPackageManager() : null;
  const workspace = toBool(flags['skip-workspace-checks'], false) ? null : workspaceChecks(root);

  const tools = {
    brew: { ok: commandAvailable('brew'), version: safeVersion('brew', ['--version']) },
    winget: { ok: commandAvailable('winget'), version: safeVersion('winget', ['--version']) },
    git: { ok: commandAvailable('git'), version: safeVersion('git') },
    node: { ok: commandAvailable('node'), version: currentNode },
    npm: { ok: commandAvailable('npm'), version: safeVersion('npm') },
    npx: { ok: commandAvailable('npx'), version: safeVersion('npx') },
    corepack: { ok: commandAvailable('corepack'), version: safeVersion('corepack') },
    pnpm: { ok: commandAvailable('pnpm'), version: safeVersion('pnpm') },
    bun: { ok: commandAvailable('bun'), version: safeVersion('bun') },
    python: { ok: python.ok, version: python.version, command: python.label, executable: python.executable },
    pip: { ok: Boolean(python.pipVersion), version: python.pipVersion, command: python.label },
    pyenv: { ok: commandAvailable('pyenv'), version: safeVersion('pyenv'), global: pyenvGlobal() },
    pythonPlaywright: { ok: Boolean(python.playwrightVersion), version: python.playwrightVersion, command: python.label },
    uv: { ok: commandAvailable('uv'), version: safeVersion('uv') },
    dotnet: { ok: commandAvailable('dotnet'), version: safeVersion('dotnet') },
    gh: { ok: commandAvailable('gh'), version: safeVersion('gh') }
  };

  for (const [key, rule] of Object.entries(TOOL_RULES)) {
    if (!tools[key]) continue;
    const requirement = key === 'node' ? nodeRequirement : rule.minimum;
    tools[key].required = rule.required;
    tools[key].requiredRange = requirement;
    tools[key].versionOk = tools[key].ok && requirementSatisfied(tools[key].version, requirement);
    tools[key].healthy = tools[key].ok && (tools[key].versionOk || !tools[key].version);
  }

  return {
    checkedAt: new Date().toISOString(),
    platform,
    elevated: isElevated(),
    linuxPackageManager: linuxManager ? linuxManager.key : '',
    workspace,
    nodeRequirement: {
      required: nodeRequirement,
      actual: currentNode,
      ok: requirementSatisfied(currentNode, nodeRequirement)
    },
    pythonResolution: {
      command: python.label,
      executable: python.executable
    },
    tools,
    notes: {
      codexPlaywrightPlugin: 'Manual check: enable the Codex/OpenAI Playwright integration in the Codex environment if you want model-driven browser automation.',
      bootstrap: 'Native wrappers request elevation first and handle Node bootstrap before this command runs.',
      linuxPackageManager: linuxManager ? `Automatic Linux installs will use ${linuxManager.command}.` : 'No supported Linux package manager detected for automatic installs.'
    }
  };
}

function toolStatus(report, key) {
  const tool = report.tools[key];
  if (!tool) return { state: 'warn', detail: 'unknown' };
  if (!tool.ok) return { state: tool.required ? 'fail' : 'warn', detail: 'missing' };
  if (tool.requiredRange && !tool.versionOk) {
    return { state: tool.required ? 'fail' : 'warn', detail: formatRequirementStatus(tool.version, tool.requiredRange) };
  }
  return { state: 'pass', detail: tool.version || 'available' };
}

function printDoctorReport(report) {
  printSection('Agent environment doctor');
  printCheck('Platform', 'pass', report.platform);
  printCheck('Elevation', report.elevated ? 'pass' : 'warn', report.elevated ? 'already elevated' : 'wrappers will request admin/sudo before installs');
  if (report.platform === 'linux') {
    printCheck('Linux package manager', report.linuxPackageManager ? 'pass' : 'warn', report.linuxPackageManager || 'unsupported for auto-install');
  }

  for (const key of ['git', 'node', 'npm', 'npx', 'python', 'pip', 'pyenv', 'pythonPlaywright', 'corepack', 'pnpm', 'bun', 'uv', 'gh', 'dotnet']) {
    const tool = report.tools[key];
    const { state, detail } = toolStatus(report, key);
    let label = TOOL_RULES[key]?.label || key;
    if (key === 'python') label = `${label}${tool.command ? ` (${tool.command})` : ''}`;
    if (key === 'pip' && tool.command) label = `${label}${tool.command ? ` (${tool.command})` : ''}`;
    if (key === 'pyenv' && tool.global) {
      printCheck(label, state, `${detail}${detail && tool.global ? ' | ' : ''}${tool.global ? `global=${tool.global}` : ''}`);
      continue;
    }
    if (key === 'python' && tool.executable) {
      printCheck(label, state, `${detail}${detail && tool.executable ? ' | ' : ''}${tool.executable}`);
      continue;
    }
    printCheck(label, state, detail);
  }

  printCheck('Codex Playwright plugin', 'warn', 'manual verification required in the Codex/OpenAI UI');

  if (report.workspace) {
    printSection('Workspace readiness');
    printCheck('Workspace root', report.workspace.exists ? 'pass' : 'fail', report.workspace.root);
    printCheck('Git repo', report.workspace.hasGitRepo ? 'pass' : 'warn', report.workspace.hasGitRepo ? '' : 'optional for direct Cloudflare-managed projects');
    printCheck('AGENTS.md', report.workspace.hasAgents ? 'pass' : 'warn');
    printCheck('README.md', report.workspace.hasReadme ? 'pass' : 'warn');
    printCheck('MEMORY.md', report.workspace.hasMemory ? 'pass' : 'warn');
    printCheck('.env.example', report.workspace.hasEnvExample ? 'pass' : 'warn');
    printCheck('package.json', report.workspace.hasPackageJson ? 'pass' : 'warn');
    printCheck('Preview command', report.workspace.hasPreviewScript ? 'pass' : 'warn', 'preview/dev script');
    printCheck('Validation command', report.workspace.hasTestScript ? 'pass' : 'warn', 'test/check script');
    printCheck('Astro config', report.workspace.hasAstroConfig ? 'pass' : 'warn');
  }

  printSection('Fix guidance');
  const windowsNodeId = WINDOWS_PACKAGES.node.currentId;
  printCheck('Windows baseline', 'warn', `winget install --id Git.Git; ${windowsNodeId}; Python.Python.3.14`);
  printCheck('macOS baseline', 'warn', 'brew install git node python@3.14 (plus Xcode Command Line Tools)' );
  printCheck('Linux baseline', 'warn', 'apt/dnf/yum/pacman/zypper installs Git + Node + Python when supported');
  printCheck('Optional tools', 'warn', 'pnpm, bun, uv, GitHub CLI, .NET SDK, and Python Playwright are installed only when missing and requested');
  printCheck('Python Playwright', 'warn', report.tools.python.ok ? `${report.tools.python.command || 'python'} -m pip install playwright && ${report.tools.python.command || 'python'} -m playwright install chromium` : 'install Python first');
}

function hardFailures(report) {
  return REQUIRED_TOOL_KEYS.some((key) => {
    const tool = report.tools[key];
    return !tool?.ok || !tool?.versionOk;
  });
}

function chooseWindowsNodePackage() {
  return WINDOWS_PACKAGES.node.currentId;
}

function installWingetPackage(id) {
  return runCommand('winget', ['install', '--id', id, '--exact', '--accept-package-agreements', '--accept-source-agreements'], {
    throwOnError: false,
    stdio: 'inherit'
  });
}

function installBrewPackage(definition) {
  const primary = runCommand('brew', definition.args, { throwOnError: false, stdio: 'inherit' });
  if (primary.status === 0 || !definition.fallbackArgs) return primary;
  return runCommand('brew', definition.fallbackArgs, { throwOnError: false, stdio: 'inherit' });
}

function installLinuxPackages(manager, packages = []) {
  if (!manager || packages.length === 0) return { status: 1 };
  const prefix = sudoArgs([]);
  if (manager.refreshArgs?.length) {
    const refreshArgs = prefix.command
      ? [manager.command, ...manager.refreshArgs]
      : manager.refreshArgs;
    runCommand(prefix.command || manager.command, refreshArgs, { throwOnError: false, stdio: 'inherit' });
  }
  const installArgs = prefix.command
    ? [manager.command, ...manager.installArgs, ...packages]
    : [...manager.installArgs, ...packages];
  return runCommand(prefix.command || manager.command, installArgs, { throwOnError: false, stdio: 'inherit' });
}

function installPythonPlaywright(pythonSpec) {
  if (!pythonSpec?.ok) return { status: 1 };
  const installPackage = runCommand(pythonSpec.command, [...pythonSpec.argsPrefix, '-m', 'pip', 'install', 'playwright'], {
    throwOnError: false,
    stdio: 'inherit'
  });
  if (installPackage.status !== 0) return installPackage;
  return runCommand(pythonSpec.command, [...pythonSpec.argsPrefix, '-m', 'playwright', 'install', 'chromium'], {
    throwOnError: false,
    stdio: 'inherit'
  });
}

function tryEnablePnpmViaCorepack() {
  if (!commandAvailable('corepack')) return false;
  const result = runCommand('corepack', ['enable', 'pnpm'], { throwOnError: false, stdio: 'inherit' });
  return result.status === 0;
}

function desiredInstallKeys(report, flags = {}) {
  const installOptional = toBool(flags['install-optional-tools'], true);
  const desired = [...REQUIRED_TOOL_KEYS];
  if (installOptional) desired.push(...OPTIONAL_INSTALL_TOOL_KEYS);
  return desired.filter((key) => {
    const tool = report.tools[key];
    if (!tool) return false;
    return !tool.ok || !tool.versionOk;
  });
}

function linuxPackagesForKeys(manager, keys = []) {
  const packages = new Set();
  for (const key of keys) {
    for (const entry of manager?.packages?.[key] || []) {
      packages.add(entry);
    }
  }
  return [...packages];
}

export async function runDoctor(flags = {}) {
  const report = collectChecks(flags);
  if (toBool(flags.json, false)) {
    process.stdout.write(prettyJson(report));
  } else {
    printDoctorReport(report);
  }
  return hardFailures(report) ? 2 : 0;
}

export async function runFix(flags = {}) {
  printSection('Deprecated command');
  printCheck('Native bootstrap required', 'warn', 'Use Web_Toolkit/scripts/bootstrap.ps1 or Web_Toolkit/scripts/bootstrap.sh for installs and repairs.');
  printCheck('Reason', 'warn', 'Node is no longer the supported installer path for host provisioning.');
  return 2;
}

export async function runVerify(flags = {}) {
  const report = collectChecks(flags);
  printDoctorReport(report);
  return hardFailures(report) ? 2 : 0;
}

export async function runPrepareHost(flags = {}) {
  return runFix(flags);
}





