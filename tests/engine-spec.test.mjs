import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WCAGATE_RANGE, WCAGATE_SPEC, engineInstallCommand, engineManager, latestReleaseTag, parseVersion, satisfiesRange } from '../Web_Toolkit/shared/lib/engine-spec.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('package.json asks for the same semver range the freshness check uses, never a pinned version', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'Web_Toolkit', 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['@imyourboyroy/wcagate'], WCAGATE_SPEC);
  assert.match(WCAGATE_SPEC, /#semver:/);
  assert.doesNotMatch(WCAGATE_SPEC, /#v?\d/);
});

test('ranges: latest, floor, caret, tilde, exact', () => {
  assert.equal(satisfiesRange('2.4.0', '*'), true);
  assert.equal(satisfiesRange('3.0.0', '>=2.3.1'), true);
  assert.equal(satisfiesRange('2.3.0', '>=2.3.1'), false);
  assert.equal(satisfiesRange('3.0.0', '^2.3.1'), false);
  assert.equal(satisfiesRange('2.9.9', '^2.3.1'), true);
  assert.equal(satisfiesRange('2.4.9', '~2.4.0'), true);
  assert.equal(satisfiesRange('2.5.0', '~2.4.0'), false);
  assert.equal(satisfiesRange('2.4.0-rc.1', '*'), false, 'prereleases never count as releases');
  assert.deepEqual(parseVersion('v2.3.1'), [2, 3, 1]);
});

test('latest release tag is the highest stable tag, peeling annotated tags', () => {
  const output = [
    `aaaaaaa1\trefs/tags/v2.3.0`, `aaaaaaa2\trefs/tags/v2.3.0^{}`,
    `bbbbbbb1\trefs/tags/v2.10.0`, `bbbbbbb2\trefs/tags/v2.10.0^{}`,
    `ccccccc1\trefs/tags/v2.9.9`, `ddddddd1\trefs/tags/v3.0.0-rc.1`, `eeeeeee1\trefs/tags/not-a-version`
  ].join('\n');
  assert.deepEqual(latestReleaseTag(output, WCAGATE_RANGE), { tag: 'v2.10.0', version: '2.10.0', commit: 'bbbbbbb2' });
  assert.equal(latestReleaseTag(output, '^2.3.0').version, '2.10.0');
  assert.equal(latestReleaseTag(output, '>=4.0.0'), null);
  assert.equal(latestReleaseTag('', '*'), null);
});

test('the engine installs with pnpm when it exists and falls back to npm; an update reinstalls the spec; nothing is locked', () => {
  assert.equal(engineManager({ env: {}, installed: (name) => name === 'pnpm' }), 'pnpm');
  assert.equal(engineManager({ env: {}, installed: () => false }), 'npm');
  assert.equal(engineManager({ env: { PORTABLE_TOOLKIT_PM: 'npm' }, installed: () => true }), 'npm');
  assert.equal(engineManager({ env: { PORTABLE_TOOLKIT_PM: 'yarn' }, installed: () => true }), 'pnpm', 'only pnpm and npm are valid for the engine');

  const pnpm = engineInstallCommand({ manager: 'pnpm' });
  assert.deepEqual([pnpm.command.replace('.cmd', ''), pnpm.args], ['pnpm', ['install']]);
  assert.deepEqual(engineInstallCommand({ manager: 'pnpm', refresh: true }).args, ['add', WCAGATE_SPEC]);

  const npm = engineInstallCommand({ manager: 'npm', refresh: true });
  assert.deepEqual(npm.args, ['install', WCAGATE_SPEC, '--allow-git=all', '--no-audit', '--no-fund', '--package-lock=false']);
  assert.ok(!engineInstallCommand({ manager: 'npm' }).args.includes(WCAGATE_SPEC), 'a plain install reads package.json');
  assert.deepEqual(engineInstallCommand({ manager: 'pnpm', spec: 'github:imyourboyroy/WCAGate#semver:^2' }).args, ['add', 'github:imyourboyroy/WCAGate#semver:^2'], 'a custom spec is always reinstalled');
});
