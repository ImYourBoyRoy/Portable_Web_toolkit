import assert from 'node:assert/strict';
import test from 'node:test';
import { commandsFor, describe, detectPackageManager } from '../Web_Toolkit/shared/lib/package-manager.mjs';

const files = (...names) => (file) => names.some((name) => file.endsWith(name));
const base = { env: {}, installed: () => true, readJson: () => { throw new Error('none'); } };

test('detection: explicit choice, then lockfile, then packageManager, then pnpm when installed', () => {
  assert.deepEqual(detectPackageManager('/p', { ...base, flag: 'npm', exists: files('pnpm-lock.yaml') }), { name: 'npm', source: '--package-manager' });
  assert.equal(detectPackageManager('/p', { ...base, env: { PORTABLE_TOOLKIT_PM: 'yarn' }, exists: () => false }).name, 'yarn');
  assert.equal(detectPackageManager('/p', { ...base, exists: files('package-lock.json') }).name, 'npm', 'existing npm sites keep working');
  assert.equal(detectPackageManager('/p', { ...base, exists: files('pnpm-lock.yaml') }).name, 'pnpm');
  assert.deepEqual(detectPackageManager('/p', { ...base, exists: () => false, readJson: () => ({ packageManager: 'bun@1.2.0' }) }), { name: 'bun', source: 'package.json packageManager' });
  assert.equal(detectPackageManager('/p', { ...base, exists: () => false }).name, 'pnpm', 'default is pnpm');
  assert.equal(detectPackageManager('/p', { ...base, exists: () => false, installed: () => false }).name, 'npm', 'falls back when pnpm is missing');
  assert.throws(() => detectPackageManager('/p', { ...base, flag: 'pip' }), /Unsupported package manager/);
});

test('command vectors per package manager', () => {
  const pnpm = commandsFor('pnpm');
  assert.deepEqual(pnpm.add(['a', 'b'], { dev: true }), ['add', '-D', 'a', 'b']);
  assert.deepEqual(pnpm.dlx('@astrojs/upgrade', ['--dry-run']), ['dlx', '@astrojs/upgrade', '--dry-run']);
  assert.deepEqual(pnpm.exec('astro', ['check']), ['exec', 'astro', 'check']);
  const npm = commandsFor('npm');
  assert.deepEqual(npm.add(['a'], { dev: true }), ['install', '-D', 'a']);
  assert.deepEqual(npm.run('build', ['--x']), ['run', 'build', '--', '--x']);
  assert.deepEqual(npm.dlx('@astrojs/upgrade', ['--dry-run']), ['exec', '--yes', '@astrojs/upgrade', '--', '--dry-run']);
  assert.equal(describe('pnpm', ['install']), 'pnpm install');
});
