#!/usr/bin/env node
// ./Web_Toolkit/scripts/setup-interactive.mjs
/**
 * Optional Node-based interactive host setup menu (for agents/CI that already have Node).
 *
 * End-user launchers (.command / .sh / .bat) must NOT depend on this file — they use
 * setup-interactive.sh / setup-interactive.ps1 so a machine without Node can still
 * bootstrap (bootstrap installs Node when missing).
 *
 * Usage:
 *   node ./Web_Toolkit/scripts/setup-interactive.mjs [--workspace <path>] [--non-interactive]
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT_ROOT = path.resolve(__dirname, '..');
const MENU_PATH = path.join(TOOLKIT_ROOT, 'Setup_agent_environment', 'config', 'setup-menu.json');

function loadMenu() {
  return JSON.parse(fs.readFileSync(MENU_PATH, 'utf8'));
}

function parseArgv(argv) {
  const flags = { workspace: process.cwd(), nonInteractive: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--workspace' && argv[i + 1]) {
      flags.workspace = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--non-interactive') {
      flags.nonInteractive = true;
    } else if (argv[i] === '--json') {
      flags.json = true;
    }
  }
  return flags;
}

function ask(rl, question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return new Promise((resolve) => {
    rl.question(`${question} [${hint}] `, (answer) => {
      const trimmed = answer.trim().toLowerCase();
      if (!trimmed) {
        resolve(defaultYes);
        return;
      }
      resolve(trimmed.startsWith('y'));
    });
  });
}

async function collectChoices(menu, flags) {
  if (flags.nonInteractive) {
    return {
      allowInstalls: true,
      optionalTools: menu.optional.map((item) => item.id),
      installPlaywright: true,
      skipWorkspaceChecks: false,
    };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('');
  console.log(`  ${menu.title}`);
  console.log(`  ${menu.subtitle}`);
  console.log('');
  console.log(`  ${menu.adminNote}`);
  console.log('');
  console.log('  About Python (pyenv-native + pyenv-gui)');
  console.log(`  ${menu.pyenvNativeBlurb}`);
  console.log('');

  for (const item of menu.required) {
    console.log(`  [required] ${item.name}`);
    console.log(`             ${item.description}`);
  }
  console.log('');

  const optionalTools = [];
  for (const item of menu.optional) {
    if (item.id === 'python-playwright') {
      continue;
    }
    const yes = await ask(rl, `Install ${item.name}? — ${item.description}`, false);
    if (yes) {
      optionalTools.push(item.id);
    }
  }

  const playwrightItem = menu.optional.find((item) => item.id === 'python-playwright');
  const installPlaywright = playwrightItem
    ? await ask(rl, `Install ${playwrightItem.name}? — ${playwrightItem.description}`, false)
    : false;

  const skipWorkspaceChecks = !(await ask(
    rl,
    `${menu.workspace.name}? — ${menu.workspace.description}`,
    menu.workspace.default,
  ));

  console.log('');
  console.log('  Summary');
  console.log('  -------');
  console.log('  Core host tools: yes (required)');
  console.log(`  Optional tools: ${optionalTools.length ? optionalTools.join(', ') : '(none)'}`);
  console.log(`  Python Playwright: ${installPlaywright ? 'yes' : 'no'}`);
  console.log(`  Workspace checks: ${skipWorkspaceChecks ? 'skipped' : 'yes'}`);
  console.log(`  Target workspace: ${flags.workspace}`);
  console.log('');

  const proceed = await ask(rl, 'Proceed with setup? Admin/sudo may be requested next', true);
  rl.close();

  if (!proceed) {
    console.log('[setup] Cancelled — no changes made.');
    process.exit(0);
  }

  return {
    allowInstalls: true,
    optionalTools,
    installPlaywright,
    skipWorkspaceChecks,
  };
}

function runBootstrap(choices, flags) {
  const commonArgs = [
    'prepare-host',
    '--workspace',
    flags.workspace,
    '--allow-installs',
    choices.allowInstalls ? 'true' : 'false',
    '--install-optional-tools',
    choices.optionalTools.length > 0 ? 'true' : 'false',
    '--install-python-playwright',
    choices.installPlaywright ? 'true' : 'false',
  ];

  if (choices.optionalTools.length > 0) {
    commonArgs.push('--optional-tools', choices.optionalTools.join(','));
  }

  if (choices.skipWorkspaceChecks) {
    commonArgs.push('--skip-workspace-checks');
  }

  if (flags.json) {
    commonArgs.push('--json');
  }

  if (process.platform === 'win32') {
    const ps1 = path.join(__dirname, 'bootstrap.ps1');
    const pwsh = process.env.PWSH_PATH || 'pwsh';
    return spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...commonArgs], {
      stdio: 'inherit',
      cwd: TOOLKIT_ROOT,
    });
  }

  const sh = path.join(__dirname, 'bootstrap.sh');
  return spawnSync('bash', [sh, ...commonArgs], { stdio: 'inherit', cwd: TOOLKIT_ROOT });
}

async function main() {
  const flags = parseArgv(process.argv.slice(2));
  const menu = loadMenu();
  const choices = await collectChoices(menu, flags);
  const result = runBootstrap(choices, flags);
  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error('[setup-interactive]', error.message ?? error);
  process.exit(1);
});
