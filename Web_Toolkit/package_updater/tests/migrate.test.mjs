import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildWorkspaceYaml, findOtherNpmMentions, parseIgnoredBuilds, planMigration, runMigrate, translateScript, translateScripts } from '../src/commands/migrate.mjs';

test('script translation covers run, install, ci, update, npx, and dlx', () => {
  const cases = {
    'npm run clean && astro dev': 'pnpm run clean && astro dev',
    'npm install -D wrangler@latest && node x.mjs': 'pnpm add -D wrangler@latest && node x.mjs',
    'npm install': 'pnpm install',
    'npm ci': 'pnpm install --frozen-lockfile',
    'npm update && npm run upgrade:wrangler': 'pnpm update && pnpm run upgrade:wrangler',
    'npx @astrojs/upgrade': 'pnpm dlx @astrojs/upgrade',
    'npx wrangler pages dev dist': 'pnpm exec wrangler pages dev dist',
    'npx --yes playwright install chromium': 'pnpm exec playwright install chromium',
    'astro build': 'astro build'
  };
  for (const [from, to] of Object.entries(cases)) assert.equal(translateScript(from), to, from);
  assert.deepEqual(translateScripts({ a: 'npm run b', c: 'astro build' }).changed, ['a']);
});

test('workspace yaml carries allowBuilds and resolved overrides, and approves only known natives', () => {
  const yaml = buildWorkspaceYaml({
    dependencies: { astro: '^7.4.12', yaml: '^2.9.1', 'left-pad': '^1.0.0' },
    devDependencies: { wrangler: '^4.163.0' },
    allowScripts: { esbuild: true, 'evil-postinstall': false, custom: true },
    overrides: { yaml: '$yaml', 'yaml-language-server': '^2.0.0' }
  });
  assert.match(yaml, /allowBuilds:\n  custom: true\n  esbuild: true\n  sharp: true\n  workerd: true\n/);
  assert.doesNotMatch(yaml, /evil-postinstall/);
  assert.match(yaml, /overrides:\n  yaml: '\^2\.9\.1'\n  yaml-language-server: '\^2\.0\.0'/);
  assert.doesNotMatch(buildWorkspaceYaml({ dependencies: { 'left-pad': '^1.0.0' } }), /allowBuilds/);
});

function project(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-migrate-'));
  const pkg = { name: 'demo', scripts: { dev: 'astro dev', 'dev:clean': 'npm run clean && astro dev', check: 'astro check', build: 'astro build' }, dependencies: { astro: '^7.4.0' }, packageManager: 'npm@11.0.0', ...extra };
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"lockfileVersion":3}\n');
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), 'steps:\n  - run: npm ci\n  - run: npm run build\n');
  return { dir, pkg };
}

test('plan: npm site gets pnpm scripts, drops the npm packageManager pin, sets an engines floor, and lists other npm mentions', () => {
  const { dir } = project();
  const plan = planMigration(dir);
  assert.equal(plan.from, 'npm');
  assert.equal(plan.next.scripts['dev:clean'], 'pnpm run clean && astro dev');
  assert.equal('packageManager' in plan.next, false, 'a pin to npm is removed');
  assert.equal(plan.next.engines.pnpm, '>=10');
  assert.ok(plan.otherMentions.some((line) => line.startsWith('.github/workflows/ci.yml:2')));
  assert.equal(findOtherNpmMentions(dir).length, 2);
});

test('apply: imports, writes settings, installs, verifies, removes the old lockfile', async () => {
  const { dir } = project();
  const steps = [];
  const code = await runMigrate({ 'project-root': dir, apply: true }, { pnpmInstalled: true, log: () => {}, runStepFn: (pm, args) => { steps.push(`${pm} ${args.join(' ')}`); return 0; } });
  assert.equal(code, 0);
  assert.deepEqual(steps, ['pnpm import', 'pnpm install', 'pnpm run check', 'pnpm run build']);
  assert.ok(fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')));
  assert.equal(fs.existsSync(path.join(dir, 'package-lock.json')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts['dev:clean'], 'pnpm run clean && astro dev');
  // re-running is a no-op once pnpm-lock.yaml exists
  fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  const again = [];
  assert.equal(await runMigrate({ 'project-root': dir, apply: true }, { pnpmInstalled: true, log: (text) => again.push(text), runStepFn: () => 0 }), 0);
  assert.match(again.join(''), /already on pnpm/);
});

test('dry-run writes nothing; a failed install restores every file and re-installs with the old manager', async () => {
  const { dir, pkg } = project();
  const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
  assert.equal(await runMigrate({ 'project-root': dir }, { log: () => {} }), 0);
  assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')), false);

  const steps = [];
  const errors = [];
  const realError = console.error;
  console.error = (message) => errors.push(String(message));
  try {
    const code = await runMigrate({ 'project-root': dir, apply: true }, {
      pnpmInstalled: true, log: () => {},
      runStepFn: (pm, args) => { steps.push(`${pm} ${args.join(' ')}`); return args[0] === 'install' && pm === 'pnpm' ? 1 : 0; }
    });
    assert.equal(code, 1);
  } finally {
    console.error = realError;
  }
  assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before, 'package.json restored');
  assert.equal(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'), '{"lockfileVersion":3}\n');
  assert.equal(fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')), false);
  assert.equal(steps.at(-1), 'npm install', 're-installed with npm after the rollback');
  assert.ok(errors.some((line) => /pnpm install failed/.test(line)));
  void pkg;
});

test('without pnpm installed the migration stops before touching anything', async () => {
  const { dir } = project();
  const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
  const realError = console.error;
  console.error = () => {};
  try { assert.equal(await runMigrate({ 'project-root': dir, apply: true }, { pnpmInstalled: false, log: () => {} }), 1); } finally { console.error = realError; }
  assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before);
});

test('an unlisted build script is named, and --allow-builds / --deny-builds write the decision', async () => {
  const output = 'Error: ERR_PNPM_IGNORED_BUILDS\n\n  x installing dependencies\n  `-> Ignored build scripts: core-js-pure@3.51.0, @scope/pkg@1.2.3,\n      esbuild@0.28.2.\n  help: Run "pnpm approve-builds"';
  assert.deepEqual(parseIgnoredBuilds(output), ['core-js-pure', '@scope/pkg', 'esbuild']);
  const { dir } = project();
  const errors = [];
  const realError = console.error;
  console.error = (message) => errors.push(String(message));
  try {
    const code = await runMigrate({ 'project-root': dir, apply: true, 'skip-verify': true }, { pnpmInstalled: true, log: () => {}, runStepFn: (pm, args) => (pm === 'pnpm' && args[0] === 'install' ? { status: 1, output: 'Ignored build scripts: core-js-pure@3.51.0.\n\nhelp: x' } : 0) });
    assert.equal(code, 1);
  } finally {
    console.error = realError;
  }
  assert.ok(errors.some((line) => /--allow-builds core-js-pure,? ?.*--deny-builds core-js-pure/.test(line) || (line.includes('--allow-builds core-js-pure') && line.includes('--deny-builds core-js-pure'))));
  const yaml = buildWorkspaceYaml({ dependencies: { astro: '^7' } }, { allow: ['custom-native'], deny: ['core-js-pure'] });
  assert.match(yaml, /core-js-pure: false/);
  assert.match(yaml, /custom-native: true/);
  const steps = [];
  assert.equal(await runMigrate({ 'project-root': dir, apply: true, 'skip-verify': true, 'deny-builds': 'core-js-pure' }, { pnpmInstalled: true, log: () => {}, runStepFn: (pm, args) => { steps.push(args[0]); return 0; } }), 0);
  assert.match(fs.readFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'utf8'), /core-js-pure: false/);
});
