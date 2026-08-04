import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

for (const required of ['README.md', 'LICENSE', 'CHANGELOG.md', 'SECURITY.md', 'MIGRATION.md', 'types/index.d.ts']) {
  await fs.access(path.join(root, required));
}
for (const target of Object.values(packageJson.bin)) await fs.access(path.join(root, target));
for (const exported of Object.values(packageJson.exports)) {
  if (typeof exported === 'string') await fs.access(path.join(root, exported));
  else for (const target of Object.values(exported)) await fs.access(path.join(root, target));
}

const imported = await import(path.join(root, 'src', 'index.mjs'));
assert.equal(imported.TOOLKIT_VERSION, packageJson.version);
assert.equal(typeof imported.runAccessibility, 'function');

const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-auditor-package-'));
const packResult = execute('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', staging], root);
const packInfo = normalizePackInfo(JSON.parse(packResult.stdout), packageJson.name);
assert.ok(packInfo.files.length > 20, 'package should contain implementation and documentation');
const names = packInfo.files.map((file) => file.path);
for (const required of ['package.json', 'src/cli.mjs', 'src/index.mjs', 'types/index.d.ts', 'README.md', 'bin/wcag-auditor.mjs']) {
  assert.ok(names.includes(required), `packed package missing ${required}`);
}
assert.ok(names.every((name) => !name.startsWith('tests/')), 'tests must not be published');
assert.ok(names.every((name) => !name.startsWith('scripts/')), 'internal scripts must not be published');
assert.ok(names.every((name) => !/a11y-toolkit|glass-providence|legacy/i.test(name)), 'stale toolkit files must not be published');

const tarball = path.join(staging, packInfo.filename);
const consumer = path.join(staging, 'consumer');
await fs.mkdir(consumer);
await fs.writeFile(path.join(consumer, 'package.json'), '{"name":"wcag-auditor-consumer","private":true,"type":"module"}\n');
execute('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer);
await fs.writeFile(path.join(consumer, 'evidence.json'), `${JSON.stringify({
  schemaVersion: 1,
  producer: { name: 'consumer-fixture', version: '1.0.0', kind: 'install-test' },
  surfaceCount: 1,
  findings: []
}, null, 2)}\n`);
await fs.writeFile(path.join(consumer, 'wcag-auditor.config.json'), `${JSON.stringify({
  schemaVersion: 1,
  project: { name: 'installed-consumer', root: '.' },
  adapters: [{ type: 'native-evidence', file: 'evidence.json' }],
  reporters: [{ type: 'json', file: 'run.json' }]
}, null, 2)}\n`);

const executable = path.join(consumer, 'node_modules', '.bin', process.platform === 'win32' ? 'wcag-auditor.cmd' : 'wcag-auditor');
execute(executable, ['validate-config', '--cwd', consumer], consumer);
execute(executable, ['run', '--cwd', consumer, '--quiet'], consumer);
const installedRun = JSON.parse(await fs.readFile(path.join(consumer, '.wcag-audit-results', 'run.json'), 'utf8'));
assert.equal(installedRun.gate.exitCode, 0);
assert.deepEqual(installedRun.reportFiles, ['.wcag-audit-results/run.json']);
execute(process.execPath, [
  '--input-type=module',
  '-e',
  `import('${packageJson.name}').then((module) => { if (typeof module.runAccessibility !== 'function') process.exit(1); })`
], consumer);

await fs.rm(staging, { recursive: true, force: true });
process.stdout.write(`Package check passed: ${packInfo.files.length} published files, packed install and CLI smoke test clean.\n`);

function normalizePackInfo(parsed, packageName) {
  if (Array.isArray(parsed)) return parsed[0];
  if (parsed && typeof parsed === 'object') {
    if (parsed.files && parsed.filename) return parsed;
    if (parsed[packageName]) return parsed[packageName];
    const first = Object.values(parsed)[0];
    if (first?.files) return first;
  }
  throw new Error(`Unexpected npm pack --json shape: ${JSON.stringify(parsed).slice(0, 200)}`);
}

function execute(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'silent' }
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
}
