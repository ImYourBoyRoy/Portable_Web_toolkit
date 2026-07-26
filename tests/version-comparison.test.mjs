import assert from 'node:assert/strict';
import test from 'node:test';

import { compareSemver, parseSemver } from '../scripts/version-lib.mjs';

test('semantic version comparison distinguishes update direction', () => {
  assert.equal(compareSemver('0.2.6', '0.3.0'), -1);
  assert.equal(compareSemver('0.3.0', '0.2.6'), 1);
  assert.equal(compareSemver('v0.3.0', '0.3.0'), 0);
});

test('stable releases sort after their prereleases', () => {
  assert.equal(compareSemver('0.3.0-rc.1', '0.3.0'), -1);
  assert.equal(compareSemver('0.3.0', '0.3.0-rc.2'), 1);
  assert.equal(compareSemver('0.3.0-rc.10', '0.3.0-rc.2'), 1);
});

test('invalid versions require manual comparison', () => {
  assert.equal(parseSemver('main'), null);
  assert.equal(parseSemver('01.0.0'), null);
  assert.equal(parseSemver('1.0.0-rc.01'), null);
  assert.equal(parseSemver('1.0.0-rc..1'), null);
  assert.equal(compareSemver('main', '0.3.0'), null);
});
