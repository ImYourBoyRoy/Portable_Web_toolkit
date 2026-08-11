// ./Web_Toolkit/wcag_auditor/tests/frost-ui.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEvidenceDocument } from '../src/adapters/manual-evidence.mjs';
import {
  axeRemediationWithFrostHint,
  frostGlassContrastCheck,
  looksLikeFrostOrTranslucent,
  normalizeSuppressionOutcomes
} from '../src/core/frost-ui.mjs';
import { starterManualEvidence } from '../src/toolkit/profile-config.mjs';

test('frost helpers detect translucent markup and guide remediations', () => {
  assert.equal(looksLikeFrostOrTranslucent('<div style="backdrop-filter: blur(8px)">'), true);
  assert.equal(looksLikeFrostOrTranslucent('<p>plain</p>'), false);
  assert.deepEqual(normalizeSuppressionOutcomes(undefined), ['failed']);
  assert.equal(normalizeSuppressionOutcomes(['passed']), null);
  const remediation = axeRemediationWithFrostHint(
    { id: 'color-contrast', help: 'Elements must have sufficient color contrast' },
    { html: '<div style="backdrop-filter:blur(10px);background:rgba(0,0,0,.25)">Hi</div>' },
    'cantTell'
  );
  assert.match(remediation, /Frosted\/glass/);
  assert.match(remediation, /outcomes:\s*\["cantTell"\]/);
});

test('starter manual evidence includes frost-glass-contrast check', () => {
  const doc = starterManualEvidence('demo-site');
  const frost = doc.checks.find((check) => check.id === 'frost-glass-contrast');
  assert.ok(frost);
  assert.deepEqual(frost.tags.slice(0, 3), ['glassmorphism', 'frost-ui', 'color-contrast']);
  assert.equal(validateEvidenceDocument(doc).length, 0);
  assert.equal(validateEvidenceDocument({ schemaVersion: 1, checks: [frostGlassContrastCheck()] }).length, 0);
});
