// ./Web_Toolkit/templates/fonts/tests/sync-fonts.test.mjs
/** End-to-end: stages a project with fake @fontsource packages in os.tmpdir() and runs the real CLI. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildWoff2 } from './fixtures.mjs';

const script = fileURLToPath(new URL('../sync-fonts.mjs', import.meta.url));
const example = readFileSync(new URL('../fonts.config.example.json', import.meta.url), 'utf8');

function stage({ packages = true, config = example, lockfile } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sync-fonts-'));
  writeFileSync(path.join(root, 'fonts.config.json'), config);
  if (lockfile) writeFileSync(path.join(root, lockfile), '');
  if (packages) {
    const add = (name, files, options) => {
      const dir = path.join(root, 'node_modules', ...name.split('/'));
      mkdirSync(path.join(dir, 'files'), { recursive: true });
      writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '5.1.0' }));
      for (const file of files) writeFileSync(path.join(dir, 'files', file), buildWoff2(options));
    };
    add('@fontsource/instrument-serif', ['instrument-serif-latin-400-normal.woff2', 'instrument-serif-latin-400-italic.woff2'], { unitsPerEm: 1000, ascent: 900, descent: -300, defaultWidth: 420 });
    add('@fontsource-variable/dm-sans', ['dm-sans-latin-wght-normal.woff2'], { unitsPerEm: 1000, ascent: 992, descent: -310, defaultWidth: 473 });
    add('@fontsource-variable/jetbrains-mono', ['jetbrains-mono-latin-wght-normal.woff2'], { unitsPerEm: 1000, ascent: 1020, descent: -300, defaultWidth: 600 });
  }
  return root;
}

const run = (root, ...args) => spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' });
const read = (root, relative) => readFileSync(path.join(root, relative), 'utf8');

test('copies fonts, writes CSS and manifest, and a second run changes nothing', () => {
  const root = stage();
  try {
    const first = run(root);
    assert.equal(first.status, 0, first.stderr);
    const files = readdirSync(path.join(root, 'public/fonts')).sort();
    assert.equal(files.length, 4);
    assert.ok(files.every((name) => /^[a-z-]+-latin-[a-z0-9]+-(normal|italic)\.[0-9a-f]{8}\.woff2$/.test(name)), files.join());

    const css = read(root, 'src/styles/fonts.generated.css');
    assert.match(css, /font-family: "Instrument Serif Fallback";/);
    assert.match(css, /font-family: "DM Sans Fallback";/);
    assert.match(css, /font-display: optional;/);
    assert.match(css, /@media \(min-width: 641px\)/);

    const manifest = JSON.parse(read(root, 'src/styles/fonts.manifest.json'));
    assert.equal(manifest.totals.files, 4);
    assert.ok(manifest.families.every((family) => family.files.every((file) => file.bytes > 0 && existsSync(path.join(root, 'public/fonts', file.file)))));
    assert.equal(manifest.families[0].packageVersion, '5.1.0');
    assert.equal(manifest.preload.length, 2);
    assert.match(manifest.families[1].metricsSource, /^font file \(hmtx\)$/);
    // DM Sans measured at 473/1000 against Arial 915/2048: size-adjust about 105.9%.
    assert.match(css, /size-adjust: 105\.\d+%;/);

    const before = [css, read(root, 'src/styles/fonts.manifest.json')];
    const second = run(root, '--json');
    assert.equal(second.status, 0, second.stderr);
    const summary = JSON.parse(second.stdout);
    assert.equal(summary.changed, false);
    assert.deepEqual(summary.written, []);
    assert.deepEqual([read(root, 'src/styles/fonts.generated.css'), read(root, 'src/styles/fonts.manifest.json')], before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--check passes when in sync, fails (exit 2) on drift, and writes nothing', () => {
  const root = stage();
  try {
    assert.equal(run(root, '--check').status, 2, 'nothing generated yet');
    assert.equal(existsSync(path.join(root, 'public/fonts')), false, '--check must not write');
    assert.equal(run(root).status, 0);
    assert.equal(run(root, '--check').status, 0);
    writeFileSync(path.join(root, 'src/styles/fonts.generated.css'), '/* edited */\n');
    const drift = run(root, '--check');
    assert.equal(drift.status, 2);
    assert.match(drift.stdout, /fonts\.generated\.css/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missing packages fail loudly with the install command for the detected package manager', () => {
  const root = stage({ packages: false, lockfile: 'pnpm-lock.yaml' });
  try {
    const result = run(root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Font package\(s\) not installed: @fontsource\/instrument-serif, @fontsource-variable\/dm-sans, @fontsource-variable\/jetbrains-mono/);
    assert.match(result.stderr, /pnpm add @fontsource-variable\/dm-sans @fontsource-variable\/jetbrains-mono @fontsource\/instrument-serif/);
    assert.equal(existsSync(path.join(root, 'src')), false, 'nothing written on failure');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a weight the package does not ship lists what is available', () => {
  const config = JSON.stringify({ families: [{ family: 'Instrument Serif', weights: [400, 900] }] });
  const root = stage({ config });
  try {
    const result = run(root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /no file "instrument-serif-latin-900-normal\.woff2"/);
    assert.match(result.stderr, /Available: instrument-serif-latin-400-italic\.woff2, instrument-serif-latin-400-normal\.woff2/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an invalid config exits 2 with every error; --help exits 0; unknown flags exit 1', () => {
  const root = stage({ config: JSON.stringify({ families: [{ family: 'A' }] }) });
  try {
    const invalid = run(root);
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /families\[0\]\.weights: required for a static family/);
    const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Exit codes:/);
    assert.equal(spawnSync(process.execPath, [script, '--bogus'], { encoding: 'utf8' }).status, 1);
    assert.equal(run(path.join(root, 'nowhere')).status, 2, 'missing config');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('files dropped from the config are pruned; files the script never wrote are left alone', () => {
  const root = stage();
  try {
    assert.equal(run(root).status, 0);
    const stray = path.join(root, 'public/fonts/my-own.woff2');
    writeFileSync(stray, 'mine');
    const trimmed = JSON.parse(example);
    trimmed.families[0].styles = ['normal'];
    writeFileSync(path.join(root, 'fonts.config.json'), JSON.stringify(trimmed));
    const result = run(root, '--json');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).removed.length, 1);
    assert.ok(!readdirSync(path.join(root, 'public/fonts')).some((name) => name.includes('italic')));
    assert.equal(readFileSync(stray, 'utf8'), 'mine');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('config metrics override measurement and a font that cannot be measured only warns', () => {
  const config = JSON.stringify({ families: [{ family: 'Instrument Serif', weights: [400], metrics: { unitsPerEm: 1000, ascent: 900, descent: 300, xWidthAvg: 400 } }] });
  const root = stage({ config });
  try {
    assert.equal(run(root).status, 0);
    const manifest = JSON.parse(read(root, 'src/styles/fonts.manifest.json'));
    assert.equal(manifest.families[0].metricsSource, 'config');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const broken = stage({ config: JSON.stringify({ families: [{ family: 'Instrument Serif', weights: [400] }] }) });
  try {
    const file = path.join(broken, 'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2');
    writeFileSync(file, Buffer.from('definitely not a woff2 file, only bytes pretending to be one'));
    const result = run(broken);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /could not read font metrics/);
    const manifest = JSON.parse(read(broken, 'src/styles/fonts.manifest.json'));
    assert.equal(manifest.families[0].fallbackFamily, null);
    assert.doesNotMatch(read(broken, 'src/styles/fonts.generated.css'), /Fallback/);
  } finally {
    rmSync(broken, { recursive: true, force: true });
  }
});

test('the installed empty manifest stub is replaced by the first sync and prunes nothing', () => {
  const root = stage();
  try {
    const stub = path.join(root, 'src/styles/fonts.manifest.json');
    mkdirSync(path.dirname(stub), { recursive: true });
    writeFileSync(stub, readFileSync(new URL('../fonts.manifest.stub.json', import.meta.url), 'utf8'));
    const first = run(root);
    assert.equal(first.status, 0, first.stderr);
    const manifest = JSON.parse(read(root, 'src/styles/fonts.manifest.json'));
    assert.ok(manifest.families.length > 0, 'stub replaced by the generated manifest');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
