import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { maybeAutoUpdate, shouldSkipForInvocation } from '../Web_Toolkit/shared/lib/auto-update.mjs';

const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-toolkit-auto-update-test-'));

test('automatic update can be disabled without touching the filesystem', () => {
  const previous = process.env.PORTABLE_TOOLKIT_AUTO_UPDATE;
  process.env.PORTABLE_TOOLKIT_AUTO_UPDATE = '0';
  try {
    const report = maybeAutoUpdate({ portableRoot: TEST_ROOT });
    assert.equal(report.status, 'disabled');
  } finally {
    if (previous === undefined) delete process.env.PORTABLE_TOOLKIT_AUTO_UPDATE;
    else process.env.PORTABLE_TOOLKIT_AUTO_UPDATE = previous;
}
});

test('automatic update is disabled during Node test processes by default', () => {
  const previous = process.env.PORTABLE_TOOLKIT_AUTO_UPDATE;
  delete process.env.PORTABLE_TOOLKIT_AUTO_UPDATE;
  try {
    const report = maybeAutoUpdate({ portableRoot: TEST_ROOT });
    assert.equal(report.status, 'disabled');
    assert.match(report.reason, /Node tests/);
  } finally {
    if (previous === undefined) delete process.env.PORTABLE_TOOLKIT_AUTO_UPDATE;
    else process.env.PORTABLE_TOOLKIT_AUTO_UPDATE = previous;
  }
});

test('help, version, and --apply invocations skip the freshness preflight', () => {
  assert.equal(shouldSkipForInvocation(['run', '--help'], {}), '--help');
  assert.equal(shouldSkipForInvocation(['help'], {}), 'help');
  assert.equal(shouldSkipForInvocation(['zone', 'harden', '--apply'], {}), '--apply');
  assert.equal(shouldSkipForInvocation(['zone', 'harden', '--apply'], { PORTABLE_TOOLKIT_AUTO_UPDATE_ON_APPLY: '1' }), '');
  assert.equal(shouldSkipForInvocation(['audit', '--site-profile', 'x.json'], {}), '');
});
