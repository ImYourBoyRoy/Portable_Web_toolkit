// ./Web_Toolkit/browser_diagnostics/src/lib/ensure-playwright.mjs
/**
 * Soft-ensure Python Playwright + Chromium for browser-diagnostics.
 *
 * Unlike wcag_auditor (Node Playwright peers), this tool uses the Python
 * Playwright package. Soft mode: warn and optionally pip-install; never force
 * a full env bootstrap without operator visibility.
 */

import { spawnSync } from 'node:child_process';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    env: process.env,
    shell: false
  });
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || '')
  };
}

function pythonImportWorks(cwd) {
  const probe = run(
    'python',
    ['-c', 'from playwright.sync_api import sync_playwright; print("ok")'],
    { cwd }
  );
  return probe.status === 0 && /ok/.test(probe.stdout);
}

/**
 * @param {{ projectRoot: string, autoInstall?: boolean }} options
 * @returns {{ ok: boolean, actions: string[], warnings: string[] }}
 */
export function ensurePythonPlaywrightReady({ projectRoot, autoInstall = true } = {}) {
  const actions = [];
  const warnings = [];
  const cwd = projectRoot || process.cwd();

  if (pythonImportWorks(cwd)) {
    return { ok: true, actions, warnings };
  }

  warnings.push('Python Playwright is not importable in the current environment.');
  if (!autoInstall) {
    warnings.push(
      'Re-run without --skip-playwright-install, or install with: python -m pip install playwright && python -m playwright install chromium'
    );
    return { ok: false, actions, warnings };
  }

  console.log('[browser-diagnostics] Installing Python playwright package…');
  const pip = run('python', ['-m', 'pip', 'install', 'playwright'], { cwd });
  actions.push('pip install playwright');
  if (pip.status !== 0) {
    warnings.push(pip.stderr.trim() || pip.stdout.trim() || 'pip install playwright failed');
    return { ok: false, actions, warnings };
  }

  console.log('[browser-diagnostics] Installing Chromium for Playwright…');
  const browsers = run('python', ['-m', 'playwright', 'install', 'chromium'], { cwd });
  actions.push('playwright install chromium');
  if (browsers.status !== 0) {
    warnings.push(browsers.stderr.trim() || browsers.stdout.trim() || 'playwright install chromium failed');
    return { ok: false, actions, warnings };
  }

  if (!pythonImportWorks(cwd)) {
    warnings.push('Playwright install finished but import still fails — check the active Python/pyenv venv.');
    return { ok: false, actions, warnings };
  }

  return { ok: true, actions, warnings };
}
