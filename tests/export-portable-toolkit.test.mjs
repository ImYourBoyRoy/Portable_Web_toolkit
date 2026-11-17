// ./tests/export-portable-toolkit.test.mjs
/**
 * Offline tests for the portable toolkit export safety guards.
 * Run: node --test ./tests/export-portable-toolkit.test.mjs
 * Covers: --to target guard, secret-shaped file skipping, nested runtime dirs.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { assertSafeExportTarget, shouldSkip, isSecretShapedFile } = await import(
  pathToFileURL(path.join(here, '..', 'Web_Toolkit', 'scripts', 'export-portable-toolkit.mjs')).href
);

function sandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
  const root = path.join(base, 'Web_Toolkit');
  fs.mkdirSync(path.join(root, '.runtime'), { recursive: true });
  return { base, root, runtimeDir: path.join(root, '.runtime'), cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
}

test('refuses the toolkit root, its parent, and a filesystem root', () => {
  const box = sandbox();
  try {
    const opts = { root: box.root, runtimeDir: box.runtimeDir };
    assert.throws(() => assertSafeExportTarget(box.root, opts), /contains the toolkit/);
    assert.throws(() => assertSafeExportTarget(box.base, opts), /contains the toolkit/);
    assert.throws(() => assertSafeExportTarget(path.join(box.root, '..', '..'), opts), /contains the toolkit/);
    assert.throws(() => assertSafeExportTarget(path.parse(box.base).root, opts), /filesystem root/);
  } finally {
    box.cleanup();
  }
});

test('refuses the home directory', () => {
  const box = sandbox();
  try {
    assert.throws(() => assertSafeExportTarget(os.homedir(), { root: box.root, runtimeDir: box.runtimeDir }), /home directory/);
  } finally {
    box.cleanup();
  }
});

test('allows the runtime folder but not other folders inside the toolkit', () => {
  const box = sandbox();
  try {
    const opts = { root: box.root, runtimeDir: box.runtimeDir };
    assert.doesNotThrow(() => assertSafeExportTarget(path.join(box.runtimeDir, 'exports', 'portable-toolkit'), opts));
    assert.throws(() => assertSafeExportTarget(path.join(box.root, 'shared'), opts), /inside the toolkit/);
  } finally {
    box.cleanup();
  }
});

test('only replaces a non-empty folder when it is a previous export or --force', () => {
  const box = sandbox();
  try {
    const opts = { root: box.root, runtimeDir: box.runtimeDir };
    const foreign = path.join(box.base, 'foreign');
    fs.mkdirSync(foreign);
    fs.writeFileSync(path.join(foreign, 'precious.txt'), 'data');
    assert.throws(() => assertSafeExportTarget(foreign, opts), /not created by a previous export/);
    assert.doesNotThrow(() => assertSafeExportTarget(foreign, { ...opts, force: true }));

    fs.writeFileSync(path.join(foreign, 'EXPORT-METADATA.json'), '{}');
    assert.doesNotThrow(() => assertSafeExportTarget(foreign, opts));

    const empty = path.join(box.base, 'empty');
    fs.mkdirSync(empty);
    assert.doesNotThrow(() => assertSafeExportTarget(empty, opts));
    assert.doesNotThrow(() => assertSafeExportTarget(path.join(box.base, 'does-not-exist-yet'), opts));
  } finally {
    box.cleanup();
  }
});

test('refuses a symlink or a regular file as the target', () => {
  const box = sandbox();
  try {
    const opts = { root: box.root, runtimeDir: box.runtimeDir };
    const real = path.join(box.base, 'real');
    fs.mkdirSync(real);
    const link = path.join(box.base, 'link');
    fs.symlinkSync(real, link);
    assert.throws(() => assertSafeExportTarget(link, opts), /symlink/);
    const file = path.join(box.base, 'file.txt');
    fs.writeFileSync(file, 'x');
    assert.throws(() => assertSafeExportTarget(file, opts), /not a directory/);
  } finally {
    box.cleanup();
  }
});

test('secret-shaped files are recognised but templates are kept', () => {
  for (const name of ['.env', '.env.local', '.env.production', '.dev.vars', '.dev.vars.staging', 'tls.pem', 'id.key', 'cert.p12']) {
    assert.equal(isSecretShapedFile(name), true, name);
  }
  for (const name of ['.env.example', '.env.sample', '.env.template', 'README.md', 'keyboard.mjs', 'monkey.json']) {
    assert.equal(isSecretShapedFile(name), false, name);
  }
});

test('shouldSkip excludes secrets and runtime folders at any depth', () => {
  for (const rel of [
    '.env.local',
    'tool/.env.production',
    'tool/.dev.vars',
    'certs/server.pem',
    'tool/.runtime/reports/a.json',
    'tool/sub/.cf-agent/state.json',
    'tool/.astro/types.d.ts',
    '.wrangler/state/x',
    'tool/node_modules/pkg/index.js',
  ]) {
    assert.equal(shouldSkip(rel, {}), true, rel);
  }
  for (const rel of ['README.md', 'shared/lib/env.mjs', 'site-starter/.env.example', 'site-profiles/example-workers.json']) {
    assert.equal(shouldSkip(rel, {}), false, rel);
  }
});
