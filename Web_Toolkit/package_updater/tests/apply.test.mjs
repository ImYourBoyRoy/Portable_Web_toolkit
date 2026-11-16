import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runPackageUpdate } from '../src/commands/update.mjs';

const doc = (versions) => ({ name: 'x', latest: versions[0][0], versions: new Map(versions.map(([version, meta = {}]) => [version, { peerDependencies: {}, dependencies: {}, engines: {}, deprecated: false, ...meta }])) });
const fetchPackumentsFn = async () => ({
  astro: doc([['7.5.0']]),
  '@astrojs/check': doc([['0.9.13', { peerDependencies: { typescript: '^5.0.0 || ^6.0.0' } }]]),
  typescript: doc([['7.0.1'], ['6.0.8']])
});

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-apply-'));
  const original = { name: 'demo', scripts: { check: 'astro check', build: 'astro build' }, dependencies: { astro: '^7.4.0', '@astrojs/check': '^0.9.12' }, devDependencies: { typescript: '^6.0.3' } };
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(original, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: original\n');
  return { dir, original };
}

test('dry-run reports updates and holds with reasons and writes nothing', async () => {
  const { dir, original } = project();
  const out = [];
  const code = await runPackageUpdate({ 'project-root': dir, 'skip-astro-upgrade': true }, { fetchPackumentsFn, log: (text) => out.push(text) });
  assert.equal(code, 0);
  const text = out.join('');
  assert.match(text, /update  astro \^7\.4\.0 -> \^7\.5\.0/);
  assert.match(text, /hold    typescript \^6\.0\.3 -> \^6\.0\.8 \| latest 7\.0\.1 \| @astrojs\/check@0\.9\.13 peers typescript/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')), original);
});

test('apply writes ranges, installs, and verifies check then build', async () => {
  const { dir } = project();
  const steps = [];
  const code = await runPackageUpdate({ 'project-root': dir, apply: true, 'skip-astro-upgrade': true, 'package-manager': 'pnpm' }, {
    fetchPackumentsFn, log: () => {}, runStepFn: (pm, args) => { steps.push(`${pm} ${args.join(' ')}`); return 0; }
  });
  assert.equal(code, 0);
  assert.deepEqual(steps, ['pnpm install', 'pnpm run check', 'pnpm run build']);
  const written = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  assert.equal(written.dependencies.astro, '^7.5.0');
  assert.equal(written.devDependencies.typescript, '^6.0.8');
});

test('a failing build restores package.json and the lockfile and re-installs', async () => {
  const { dir, original } = project();
  const steps = [];
  const errors = [];
  const realError = console.error;
  console.error = (message) => errors.push(String(message));
  try {
    const code = await runPackageUpdate({ 'project-root': dir, apply: true, 'skip-astro-upgrade': true, 'package-manager': 'pnpm' }, {
      fetchPackumentsFn, log: () => {},
      runStepFn: (pm, args) => {
        steps.push(args.join(' '));
        if (args.join(' ') === 'run build') {
          // the "update" also rewrote the lockfile on disk, as an install would
          fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: upgraded\n');
          return 1;
        }
        return 0;
      }
    });
    assert.equal(code, 1);
  } finally {
    console.error = realError;
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')), original, 'ranges restored');
  assert.equal(fs.readFileSync(path.join(dir, 'pnpm-lock.yaml'), 'utf8'), 'lockfileVersion: original\n', 'lockfile restored');
  assert.deepEqual(steps, ['install', 'run check', 'run build', 'install'], 'resynced with a re-install after the rollback');
  assert.ok(errors.some((line) => /`build` failed after the update. Restored package\.json and the lockfile/.test(line)));
});

test('a failed install, or an unresolvable package, never leaves a half-written project', async () => {
  const { dir, original } = project();
  const realError = console.error;
  console.error = () => {};
  try {
    assert.equal(await runPackageUpdate({ 'project-root': dir, apply: true, 'skip-astro-upgrade': true, 'package-manager': 'npm' }, { fetchPackumentsFn, log: () => {}, runStepFn: () => 1 }), 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')), original);
    const broken = async () => ({ astro: { error: 'HTTP 503' }, '@astrojs/check': doc([['0.9.13']]), typescript: doc([['6.0.8']]) });
    assert.equal(await runPackageUpdate({ 'project-root': dir, apply: true, 'skip-astro-upgrade': true, 'package-manager': 'npm' }, { fetchPackumentsFn: broken, log: () => {}, runStepFn: () => 0 }), 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')), original, 'a registry error writes nothing');
  } finally {
    console.error = realError;
  }
});

test('a held package comes with its blocker, its newest declaration, when it lifts, and the user-facing options', async () => {
  const { planUpdates } = await import('../src/commands/update.mjs');
  const { loadPolicy } = await import('../src/lib/policy.mjs');
  const { dir } = project();
  const plan = await planUpdates(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')), loadPolicy(dir), { fetchPackumentsFn });
  const hold = plan.holds.find((entry) => entry.name === 'typescript');
  assert.equal(hold.blockedBy, '@astrojs/check@0.9.13');
  assert.equal(hold.blockerRange, '^5.0.0 || ^6.0.0');
  assert.deepEqual(hold.blockerLatest, { version: '0.9.13', declares: '^5.0.0 || ^6.0.0' });
  assert.equal(hold.blockerLatestAllowsLatest, false);
  assert.match(hold.liftsWhen, /when @astrojs\/check publishes a release whose peer range allows typescript 7\.x/);
  assert.deepEqual(hold.options.map((option) => option.id), ['wait', 'accept-risk']);
  assert.equal(hold.options[0].recommended, true);
  assert.match(hold.options[1].text, /acceptPeerConflicts/);
});

test('an accepted peer conflict is honored, recorded in the report, and requires a reason', async () => {
  const { planUpdates, renderPlan } = await import('../src/commands/update.mjs');
  const { validatePolicy } = await import('../src/lib/policy.mjs');
  const { dir } = project();
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const policy = { anchors: ['astro'], acceptPeerConflicts: [{ package: 'typescript', owner: '@astrojs/check', reason: 'Roy approved 2026-11-16; re-check when @astrojs/check ships 7 support' }] };
  const plan = await planUpdates(pkg, policy, { fetchPackumentsFn });
  assert.ok(plan.changes.some((change) => change.name === 'typescript' && change.to === '^7.0.1'), 'typescript moves to 7');
  assert.equal(plan.holds.some((hold) => hold.name === 'typescript'), false);
  assert.equal(plan.accepted.length, 1);
  assert.match(renderPlan(plan, 'x'), /accepted risk: typescript newer than @astrojs\/check supports \(\^5\.0\.0 \|\| \^6\.0\.0\): Roy approved/);
  assert.match(validatePolicy({ acceptPeerConflicts: [{ package: 'typescript', owner: '@astrojs/check' }] }).join(), /reason is required/);
  assert.deepEqual(validatePolicy(policy), []);
});

test('--json prints exactly one JSON document on stdout and keeps progress on stderr', async () => {
  const { dir } = project();
  const stdout = [];
  const realWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { stdout.push(String(chunk)); return true; };
  try {
    assert.equal(await runPackageUpdate({ 'project-root': dir, 'skip-astro-upgrade': true, json: true }, { fetchPackumentsFn, log: () => {} }), 0);
  } finally {
    process.stdout.write = realWrite;
  }
  const doc = JSON.parse(stdout.join(''));
  assert.equal(doc.mode, 'dry-run');
  assert.equal(doc.holds[0].name, 'typescript');
  assert.ok(Array.isArray(doc.changes) && Array.isArray(doc.current));
});

test('release age: fresh packages get tooNew from the full document, old ones skip the extra request, and the plan explains the wait', async () => {
  const { applyReleaseAge } = await import('../src/lib/registry.mjs');
  const { planUpdates } = await import('../src/commands/update.mjs');
  const now = Date.parse('2026-11-16T12:00:00Z');
  const make = (modified) => ({ name: 'wrangler', latest: '4.163.0', modified, versions: new Map([['4.163.0', { peerDependencies: {}, dependencies: {}, engines: {}, deprecated: false }], ['4.162.2', { peerDependencies: {}, dependencies: {}, engines: {}, deprecated: false }]]) });
  let requests = 0;
  const fetchImpl = async () => { requests += 1; return { ok: true, json: async () => ({ time: { '4.163.0': '2026-11-16T09:00:00Z', '4.162.2': '2026-11-10T09:00:00Z' } }) }; };
  const old = await applyReleaseAge(make('2026-11-01T00:00:00Z'), 86_400_000, { fetchImpl, now });
  assert.equal(requests, 0, 'untouched for a day: no full-document request');
  assert.equal(old.versions.get('4.163.0').tooNew, undefined);
  const fresh = await applyReleaseAge(make('2026-11-16T09:00:00Z'), 86_400_000, { fetchImpl, now });
  assert.equal(requests, 1);
  assert.equal(fresh.versions.get('4.163.0').tooNew, true);
  assert.equal(fresh.versions.get('4.162.2').tooNew, undefined);
  assert.equal((await applyReleaseAge(make('2026-11-16T09:00:00Z'), 0, { fetchImpl, now })).versions.get('4.163.0').tooNew, undefined, '0 disables');

  const plan = await planUpdates({ devDependencies: { wrangler: '^4.150.0' } }, { anchors: [] }, { fetchPackumentsFn: async () => ({ wrangler: fresh }) });
  const hold = plan.holds[0];
  assert.equal(hold.to, '^4.162.2');
  assert.match(hold.liftsWhen, /automatically once wrangler@4\.163\.0 is old enough/);
  assert.deepEqual(hold.options.map((option) => option.id), ['wait', 'bypass-age']);
});
