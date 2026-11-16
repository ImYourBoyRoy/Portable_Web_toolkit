// ./Web_Toolkit/package_updater/src/lib/astro-upgrade.mjs
/**
 * Detect Astro projects and run the official `npx @astrojs/upgrade` flow.
 *
 * Dry-run (default): `npx --yes @astrojs/upgrade --dry-run`
 * Apply:             `npx --yes @astrojs/upgrade` [optional tag]
 *
 * Major upgrades may prompt once; we answer yes via stdin (confirm initial=true).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ASTRO_CONFIG_CANDIDATES = [
  'astro.config.mjs',
  'astro.config.js',
  'astro.config.ts',
  'astro.config.mts',
  'astro.config.cjs'
];

/** The command line that runs the official upgrader through the project's package manager. */
export function upgradeCommand(packageManager, extra = []) {
  switch (packageManager) {
    case 'pnpm': return ['pnpm', 'dlx', '@astrojs/upgrade', ...extra];
    case 'yarn': return ['yarn', 'dlx', '@astrojs/upgrade', ...extra];
    case 'bun': return ['bun', 'x', '@astrojs/upgrade', ...extra];
    default: return ['npx', '--yes', '@astrojs/upgrade', ...extra];
  }
}

/**
 * @param {object} pkg
 * @param {string} projectRoot
 */
export function isAstroProject(pkg, projectRoot) {
  const deps = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {})
  };
  if (typeof deps.astro === 'string' && deps.astro.trim() !== '') return true;
  return ASTRO_CONFIG_CANDIDATES.some((name) => fs.existsSync(path.join(projectRoot, name)));
}

/**
 * @param {object} options
 * @param {string} options.projectRoot
 * @param {boolean} options.apply
 * @param {string} [options.tag] npm dist-tag (default latest)
 * @param {'pnpm' | 'npm' | 'yarn' | 'bun'} [options.packageManager] pnpm uses `pnpm dlx`; npm (or unset) keeps `npx`
 * @param {typeof spawn} [options.spawnFn]
 * @param {(chunk: string) => void} [options.onStdout]
 * @param {(chunk: string) => void} [options.onStderr]
 * @returns {Promise<{ skipped: boolean, code: number, command: string[], reason?: string }>}
 */
export async function runAstroUpgrade({
  projectRoot,
  apply = false,
  tag = 'latest',
  packageManager,
  spawnFn = spawn,
  onStdout = (chunk) => process.stdout.write(chunk),
  onStderr = (chunk) => process.stderr.write(chunk)
} = {}) {
  const root = path.resolve(projectRoot || '.');
  const extra = [];
  if (tag && tag !== 'latest') extra.push(String(tag));
  if (!apply) extra.push('--dry-run');
  const command = upgradeCommand(packageManager, extra);
  const timeoutMs = apply ? 300000 : 120000;

  return await new Promise((resolve) => {
    const child = spawnFn(command[0], command.slice(1), {
      cwd: root,
      env: {
        ...process.env,
        npm_config_yes: 'true',
        // Prefer non-interactive defaults when the CLI checks CI-ish envs.
        CI: process.env.CI || '1'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({
        skipped: false,
        code: 1,
        command,
        reason: `timed out after ${timeoutMs}ms`
      });
    }, timeoutMs);

    child.stdout?.on('data', (buf) => onStdout(String(buf)));
    child.stderr?.on('data', (buf) => onStderr(String(buf)));

    // ConfirmPrompt uses Enter to accept initial=true (continue on majors).
    try {
      child.stdin?.write('\n');
      child.stdin?.end();
    } catch {
      // ignore broken pipe if process exits early
    }

    child.on('error', (error) => {
      clearTimeout(timer);
      finish({
        skipped: false,
        code: 1,
        command,
        reason: error.message
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      finish({
        skipped: false,
        code: code == null ? 1 : code,
        command
      });
    });
  });
}
