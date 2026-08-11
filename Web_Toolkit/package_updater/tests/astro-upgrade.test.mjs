// ./Web_Toolkit/package_updater/tests/astro-upgrade.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { isAstroProject, runAstroUpgrade } from '../src/lib/astro-upgrade.mjs';
import { runPackageUpdate } from '../src/commands/update.mjs';

test('isAstroProject detects dependency and config file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-upd-astro-'));
  assert.equal(isAstroProject({ dependencies: { astro: '^5.0.0' } }, tmp), true);
  assert.equal(isAstroProject({ dependencies: {} }, tmp), false);
  fs.writeFileSync(path.join(tmp, 'astro.config.mjs'), 'export default {};\n');
  assert.equal(isAstroProject({ dependencies: {} }, tmp), true);
});

test('runAstroUpgrade uses dry-run unless apply', async () => {
  const calls = [];
  const spawnFn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write() {}, end() {} };
    child.kill = () => {};
    queueMicrotask(() => child.emit('close', 0));
    return child;
  };

  const dry = await runAstroUpgrade({
    projectRoot: '/tmp',
    apply: false,
    spawnFn,
    onStdout() {},
    onStderr() {}
  });
  assert.equal(dry.code, 0);
  assert.deepEqual(dry.command, ['npx', '--yes', '@astrojs/upgrade', '--dry-run']);

  const applied = await runAstroUpgrade({
    projectRoot: '/tmp',
    apply: true,
    tag: 'latest',
    spawnFn,
    onStdout() {},
    onStderr() {}
  });
  assert.deepEqual(applied.command, ['npx', '--yes', '@astrojs/upgrade']);

  const beta = await runAstroUpgrade({
    projectRoot: '/tmp',
    apply: true,
    tag: 'beta',
    spawnFn,
    onStdout() {},
    onStderr() {}
  });
  assert.deepEqual(beta.command, ['npx', '--yes', '@astrojs/upgrade', 'beta']);
  assert.equal(calls.length, 3);
});

test('runPackageUpdate fails when @astrojs/upgrade fails', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-upd-fail-'));
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'demo', dependencies: { astro: '^7.0.0' } }, null, 2)
  );

  const code = await runPackageUpdate(
    { 'project-root': tmp },
    {
      runAstroUpgradeFn: async () => ({
        skipped: false,
        code: 2,
        command: ['npx', '--yes', '@astrojs/upgrade', '--dry-run'],
        reason: 'boom'
      })
    }
  );
  assert.equal(code, 1);
});

test('runPackageUpdate can skip astro upgrade', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-upd-skip-'));
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({
      name: 'demo',
      dependencies: {
        // Use a file: dep so registry fetch is skipped and we stay offline-stable.
        local: 'file:../local'
      },
      devDependencies: {
        astro: '^7.0.0'
      }
    }, null, 2)
  );

  let called = false;
  const code = await runPackageUpdate(
    { 'project-root': tmp, 'skip-astro-upgrade': true },
    {
      runAstroUpgradeFn: async () => {
        called = true;
        return { skipped: false, code: 0, command: ['npx'] };
      }
    }
  );
  assert.equal(called, false);
  assert.equal(code, 0);
});
