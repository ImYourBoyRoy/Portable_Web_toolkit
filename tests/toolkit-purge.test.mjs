// ./tests/toolkit-purge.test.mjs
/**
 * Offline tests for toolkit-purge target discovery and safe removal.
 * Run: node --test ./tests/toolkit-purge.test.mjs
 * Covers: symlink escape, vendored node_modules, scoped output/zip rules, root containment.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { collectTargets, removeTarget, isInsideRoot } = await import(
  pathToFileURL(path.join(here, '..', 'Web_Toolkit', 'toolkit_purge', 'src', 'lib', 'targets.mjs')).href
);

function makeSandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-test-'));
  const root = path.join(base, 'Web_Toolkit');
  const outside = path.join(base, 'outside');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(outside, '.runtime'), { recursive: true });
  fs.writeFileSync(path.join(outside, '.runtime', 'keep.txt'), 'keep');
  return { base, root, outside, cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
}

const rel = (root, targets) => targets.map((target) => path.relative(root, target).replace(/\\/g, '/')).sort();

test('finds generated runtime folders but not symlinked ones', () => {
  const sandbox = makeSandbox();
  try {
    fs.mkdirSync(path.join(sandbox.root, '.runtime'));
    fs.symlinkSync(sandbox.outside, path.join(sandbox.root, 'linkdir'));
    assert.deepEqual(rel(sandbox.root, collectTargets(sandbox.root)), ['.runtime']);
  } finally {
    sandbox.cleanup();
  }
});

test('never lists targets reachable only through a symlink', () => {
  const sandbox = makeSandbox();
  try {
    fs.symlinkSync(sandbox.outside, path.join(sandbox.root, 'linkdir'));
    assert.deepEqual(collectTargets(sandbox.root), []);
  } finally {
    sandbox.cleanup();
  }
});

test('survives a symlink cycle', () => {
  const sandbox = makeSandbox();
  try {
    fs.mkdirSync(path.join(sandbox.root, 'a'));
    fs.symlinkSync(sandbox.root, path.join(sandbox.root, 'a', 'loop'));
    assert.deepEqual(collectTargets(sandbox.root), []);
  } finally {
    sandbox.cleanup();
  }
});

test('skips vendored node_modules and .git', () => {
  const sandbox = makeSandbox();
  try {
    fs.mkdirSync(path.join(sandbox.root, 'tool', 'node_modules', 'pkg', 'dist'), { recursive: true });
    fs.mkdirSync(path.join(sandbox.root, 'tool', 'node_modules', 'pkg', '.runtime'), { recursive: true });
    fs.mkdirSync(path.join(sandbox.root, '.git', '.runtime'), { recursive: true });
    assert.deepEqual(collectTargets(sandbox.root), []);
  } finally {
    sandbox.cleanup();
  }
});

test('output/dist only match at the root or directly inside a tool folder', () => {
  const sandbox = makeSandbox();
  try {
    fs.mkdirSync(path.join(sandbox.root, 'output'));
    fs.mkdirSync(path.join(sandbox.root, 'site_doctor', 'output'), { recursive: true });
    fs.mkdirSync(path.join(sandbox.root, 'site_doctor', 'src', 'output'), { recursive: true });
    fs.mkdirSync(path.join(sandbox.root, 'site_doctor', 'fixtures', 'deep', 'dist'), { recursive: true });
    fs.mkdirSync(path.join(sandbox.root, '.hidden', 'output'), { recursive: true });
    assert.deepEqual(rel(sandbox.root, collectTargets(sandbox.root)), ['output', 'site_doctor/output']);
  } finally {
    sandbox.cleanup();
  }
});

test('the setup engine build output (setup_engine/target) is generated; a target folder elsewhere is not', () => {
  const sandbox = makeSandbox();
  try {
    fs.mkdirSync(path.join(sandbox.root, 'setup_engine', 'target', 'release'), { recursive: true });
    fs.mkdirSync(path.join(sandbox.root, 'some_tool', 'target'), { recursive: true });
    fs.mkdirSync(path.join(sandbox.root, 'setup_engine', 'src', 'target'), { recursive: true });
    assert.deepEqual(rel(sandbox.root, collectTargets(sandbox.root)), ['setup_engine/target']);
  } finally {
    sandbox.cleanup();
  }
});

test('zip archives only match beside the toolkit root', () => {
  const sandbox = makeSandbox();
  try {
    fs.writeFileSync(path.join(sandbox.root, 'export.zip'), 'z');
    fs.mkdirSync(path.join(sandbox.root, 'tool', 'fixtures'), { recursive: true });
    fs.writeFileSync(path.join(sandbox.root, 'tool', 'fixtures', 'sample.zip'), 'z');
    fs.writeFileSync(path.join(sandbox.root, 'tool', 'stale.pyc'), 'p');
    assert.deepEqual(rel(sandbox.root, collectTargets(sandbox.root)), ['export.zip', 'tool/stale.pyc']);
  } finally {
    sandbox.cleanup();
  }
});

test('removeTarget deletes an in-root directory', () => {
  const sandbox = makeSandbox();
  try {
    const target = path.join(sandbox.root, '.runtime');
    fs.mkdirSync(path.join(target, 'reports'), { recursive: true });
    assert.equal(removeTarget(sandbox.root, target), 'removed');
    assert.equal(fs.existsSync(target), false);
    assert.equal(removeTarget(sandbox.root, target), 'missing');
  } finally {
    sandbox.cleanup();
  }
});

test('removeTarget refuses symlinks and never touches the link target', () => {
  const sandbox = makeSandbox();
  try {
    const link = path.join(sandbox.root, 'linkdir');
    fs.symlinkSync(sandbox.outside, link);
    assert.throws(() => removeTarget(sandbox.root, link), /symlink/i);
    assert.ok(fs.existsSync(path.join(sandbox.outside, '.runtime', 'keep.txt')));
  } finally {
    sandbox.cleanup();
  }
});

test('removeTarget refuses a path outside the root and the root itself', () => {
  const sandbox = makeSandbox();
  try {
    assert.throws(() => removeTarget(sandbox.root, path.join(sandbox.outside, '.runtime')), /outside toolkit root/);
    assert.throws(() => removeTarget(sandbox.root, sandbox.root), /outside toolkit root/);
    assert.ok(fs.existsSync(path.join(sandbox.outside, '.runtime', 'keep.txt')));
    assert.equal(isInsideRoot(sandbox.root, sandbox.root), false);
  } finally {
    sandbox.cleanup();
  }
});

test('a symlinked parent directory cannot smuggle a delete outside the root', () => {
  const sandbox = makeSandbox();
  try {
    fs.symlinkSync(sandbox.outside, path.join(sandbox.root, 'via'));
    const sneaky = path.join(sandbox.root, 'via', '.runtime');
    assert.throws(() => removeTarget(sandbox.root, sneaky), /outside toolkit root/);
    assert.ok(fs.existsSync(path.join(sandbox.outside, '.runtime', 'keep.txt')));
  } finally {
    sandbox.cleanup();
  }
});
