import assert from 'node:assert/strict';
import test from 'node:test';
import { needsShell, quoteForCmd, resolveSpawn } from '../Web_Toolkit/shared/lib/spawn-cross.mjs';

test('only Windows shims go through cmd.exe; macOS and Linux never use a shell', () => {
  for (const platform of ['linux', 'darwin']) {
    assert.equal(needsShell('pnpm', platform), false);
    assert.equal(needsShell('foo.cmd', platform), false);
  }
  for (const name of ['pnpm', 'npm', 'npx', 'yarn', 'wrangler', 'foo.cmd', 'C:\\tools\\bar.BAT']) assert.equal(needsShell(name, 'win32'), true, name);
  for (const name of ['node', 'node.exe', 'C:\\Program Files\\nodejs\\node.exe', 'git']) assert.equal(needsShell(name, 'win32'), false, name);
});

test('cmd.exe command lines quote only what needs it and keep the whole line verbatim', () => {
  assert.equal(quoteForCmd('install'), 'install');
  assert.equal(quoteForCmd('github:imyourboyroy/WCAGate#semver:*'), '"github:imyourboyroy/WCAGate#semver:*"');
  assert.equal(quoteForCmd('>=2 <4'), '">=2 <4"');
  assert.equal(quoteForCmd('say "hi"'), '"say ""hi"""');
  assert.equal(quoteForCmd(''), '""');
  const spawned = resolveSpawn('pnpm', ['add', 'github:imyourboyroy/WCAGate#semver:>=2'], { cwd: 'C:\\site' }, 'win32', 'C:\\Windows\\System32\\cmd.exe');
  assert.equal(spawned.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(spawned.args, ['/d', '/s', '/c', '"pnpm add "github:imyourboyroy/WCAGate#semver:>=2""']);
  assert.equal(spawned.options.windowsVerbatimArguments, true);
  assert.equal(spawned.options.cwd, 'C:\\site');
  const direct = resolveSpawn('node', ['-v'], {}, 'linux');
  assert.deepEqual([direct.command, direct.args], ['node', ['-v']]);
});
