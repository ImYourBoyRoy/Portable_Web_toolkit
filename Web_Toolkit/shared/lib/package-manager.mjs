// ./Web_Toolkit/shared/lib/package-manager.mjs
/**
 * Package-manager awareness for toolkit commands that touch a CLIENT project (install, add, run, exec, dlx).
 *
 * Default is pnpm (shared content-addressable store: a second site added ~80 MB instead of ~665 MB in a measured
 * npm vs pnpm comparison; strict, non-flat node_modules). Detection order, so existing npm sites keep working:
 *   1. explicit --package-manager / PORTABLE_TOOLKIT_PM
 *   2. the project's lockfile (pnpm-lock.yaml, package-lock.json, yarn.lock, bun.lock)
 *   3. package.json "packageManager" (name only; the version is never read, so nothing is pinned by the toolkit)
 *   4. pnpm when it is installed, otherwise npm
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSyncCross } from './spawn-cross.mjs';

export const SUPPORTED = Object.freeze(['pnpm', 'npm', 'yarn', 'bun']);
const LOCKFILES = [['pnpm-lock.yaml', 'pnpm'], ['package-lock.json', 'npm'], ['npm-shrinkwrap.json', 'npm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun']];

export function isInstalled(name, run = spawnSyncCross) {
  try {
    return run(name, ['--version'], { stdio: 'ignore', timeout: 15_000 }).status === 0;
  } catch {
    return false;
  }
}

/**
 * @param {string} projectRoot
 * @param {{ flag?: string, env?: Record<string, string | undefined>, exists?: (file: string) => boolean, readJson?: (file: string) => any, installed?: (name: string) => boolean }} [options]
 * @returns {{ name: string, source: string }}
 */
export function detectPackageManager(projectRoot, options = {}) {
  const env = options.env ?? process.env;
  const exists = options.exists ?? fs.existsSync;
  const readJson = options.readJson ?? ((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  const installed = options.installed ?? ((name) => isInstalled(name));

  const explicit = String(options.flag || env.PORTABLE_TOOLKIT_PM || '').trim().toLowerCase();
  if (explicit) {
    if (!SUPPORTED.includes(explicit)) throw new Error(`Unsupported package manager "${explicit}". Use one of: ${SUPPORTED.join(', ')}.`);
    return { name: explicit, source: options.flag ? '--package-manager' : 'PORTABLE_TOOLKIT_PM' };
  }
  for (const [file, name] of LOCKFILES) {
    if (exists(path.join(projectRoot, file))) return { name, source: file };
  }
  try {
    const declared = String(readJson(path.join(projectRoot, 'package.json')).packageManager ?? '').split('@')[0];
    if (SUPPORTED.includes(declared)) return { name: declared, source: 'package.json packageManager' };
  } catch {
    // no readable package.json: fall through to the default
  }
  return installed('pnpm') ? { name: 'pnpm', source: 'default (pnpm installed)' } : { name: 'npm', source: 'default (pnpm not installed)' };
}

/** Argument vectors for one package manager. `exec` runs a local binary; `dlx` runs a package without installing it. */
export function commandsFor(name) {
  switch (name) {
    case 'pnpm':
      return { bin: 'pnpm', install: () => ['install'], add: (packages, { dev = false } = {}) => ['add', ...(dev ? ['-D'] : []), ...packages], run: (script, args = []) => ['run', script, ...args], exec: (bin, args = []) => ['exec', bin, ...args], dlx: (pkg, args = []) => ['dlx', pkg, ...args] };
    case 'yarn':
      return { bin: 'yarn', install: () => ['install'], add: (packages, { dev = false } = {}) => ['add', ...(dev ? ['-D'] : []), ...packages], run: (script, args = []) => ['run', script, ...args], exec: (bin, args = []) => [bin, ...args], dlx: (pkg, args = []) => ['dlx', pkg, ...args] };
    case 'bun':
      return { bin: 'bun', install: () => ['install'], add: (packages, { dev = false } = {}) => ['add', ...(dev ? ['-d'] : []), ...packages], run: (script, args = []) => ['run', script, ...args], exec: (bin, args = []) => ['x', bin, ...args], dlx: (pkg, args = []) => ['x', pkg, ...args] };
    default:
      return { bin: 'npm', install: () => ['install'], add: (packages, { dev = false } = {}) => ['install', ...(dev ? ['-D'] : []), ...packages], run: (script, args = []) => ['run', script, ...(args.length ? ['--', ...args] : [])], exec: (bin, args = []) => ['exec', '--', bin, ...args], dlx: (pkg, args = []) => ['exec', '--yes', pkg, ...(args.length ? ['--', ...args] : [])] };
  }
}

/**
 * [command, args] to run a locally installed binary (npm keeps the familiar `npx`) or, with `dlx: true`, a package that
 * is not installed (lighthouse): npx / pnpm dlx / yarn dlx / bun x.
 */
export function binaryCommand(name, bin, args = [], { dlx = false } = {}) {
  const exe = (command) => (process.platform === 'win32' && command !== 'bun' ? `${command}.cmd` : command);
  switch (name) {
    case 'pnpm': return [exe('pnpm'), dlx ? ['dlx', bin, ...args] : ['exec', bin, ...args]];
    case 'yarn': return [exe('yarn'), dlx ? ['dlx', bin, ...args] : [bin, ...args]];
    case 'bun': return ['bun', ['x', bin, ...args]];
    default: return [exe('npx'), dlx ? ['--yes', bin, ...args] : [bin, ...args]];
  }
}

/** Runs a package manager (pnpm.cmd and friends are run through cmd.exe on Windows); returns spawnSync's result. */
export function runPackageManager(name, args, options = {}) {
  const spec = commandsFor(name);
  return (options.spawn ?? spawnSyncCross)(spec.bin, args, { stdio: 'inherit', encoding: 'utf8', ...options.spawnOptions });
}

/** Human-readable `pnpm add -D x` form for messages. */
export function describe(name, args) {
  return [commandsFor(name).bin, ...args].join(' ');
}
