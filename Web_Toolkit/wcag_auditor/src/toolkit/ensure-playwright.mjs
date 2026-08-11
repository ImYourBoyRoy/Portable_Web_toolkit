// ./Web_Toolkit/wcag_auditor/src/toolkit/ensure-playwright.mjs
/**
 * Cross-platform Playwright Chromium readiness for WCAG auditor runs.
 *
 * Peers live in the **client project** (`playwright`, `@axe-core/playwright`).
 * This helper verifies packages and installs Chromium browsers when missing.
 *
 * Usage (from toolkit CLI):
 *   await ensurePlaywrightReady({ projectRoot, browser: 'chromium' })
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

function packageExists(projectRoot, name) {
  return fs.existsSync(path.join(projectRoot, 'node_modules', name, 'package.json'));
}

function runNpm(projectRoot, args, { inherit = true } = {}) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, args, {
    cwd: projectRoot,
    stdio: inherit ? 'inherit' : 'pipe',
    shell: process.platform === 'win32',
    env: process.env
  });
  return result;
}

async function chromiumLaunchWorks(projectRoot) {
  try {
    const require = createRequire(path.join(projectRoot, 'package.json'));
    const entry = require.resolve('playwright');
    const playwright = await import(pathToFileURL(entry).href);
    const browserType = playwright.chromium || playwright.default?.chromium;
    if (!browserType?.launch) return false;
    const browser = await browserType.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure Playwright + axe peers and Chromium are ready in the client project.
 * @param {{ projectRoot: string, browser?: string, autoInstall?: boolean }} options
 * @returns {Promise<{ ok: boolean, actions: string[], warnings: string[] }>}
 */
export async function ensurePlaywrightReady({
  projectRoot,
  browser = 'chromium',
  autoInstall = true
} = {}) {
  const actions = [];
  const warnings = [];
  const root = path.resolve(projectRoot);

  if (!fs.existsSync(path.join(root, 'package.json'))) {
    return {
      ok: false,
      actions,
      warnings: [`No package.json under ${root} — install playwright peers in the client project.`]
    };
  }

  const missing = [];
  if (!packageExists(root, 'playwright')) missing.push('playwright');
  if (!packageExists(root, '@axe-core/playwright')) missing.push('@axe-core/playwright');

  if (missing.length > 0) {
    if (!autoInstall) {
      return {
        ok: false,
        actions,
        warnings: [
          `Missing npm peers in client project: ${missing.join(', ')}.`,
          `Run: npm install --save-dev ${missing.join(' ')} && npx playwright install ${browser}`
        ]
      };
    }
    console.log(`[wcag-auditor] installing Playwright peers in client project: ${missing.join(', ')}`);
    const install = runNpm(root, ['install', '--save-dev', ...missing]);
    actions.push(`npm install --save-dev ${missing.join(' ')}`);
    if (install.status !== 0) {
      return {
        ok: false,
        actions,
        warnings: [`Failed to install ${missing.join(', ')} (exit ${install.status}).`]
      };
    }
  }

  const browserOk = await chromiumLaunchWorks(root);
  if (!browserOk) {
    if (!autoInstall) {
      return {
        ok: false,
        actions,
        warnings: [
          `Playwright ${browser} browser binary missing or broken.`,
          `Run from the client project: npx playwright install ${browser}`
        ]
      };
    }
    console.log(`[wcag-auditor] installing Playwright browser: ${browser}`);
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const browserInstall = spawnSync(npxCmd, ['playwright', 'install', browser], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env
    });
    actions.push(`npx playwright install ${browser}`);
    if (browserInstall.status !== 0) {
      return {
        ok: false,
        actions,
        warnings: [`Failed to install Playwright ${browser} (exit ${browserInstall.status}).`]
      };
    }
    const retry = await chromiumLaunchWorks(root);
    if (!retry) {
      return {
        ok: false,
        actions,
        warnings: [`Playwright ${browser} still cannot launch after install.`]
      };
    }
  }

  return { ok: true, actions, warnings };
}
