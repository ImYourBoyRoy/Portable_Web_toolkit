// ./Web_Toolkit/brand_doctor/tests/brand-guide.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { brandGuideColorDrift, findBrandGuide } from '../src/lib/brand-guide.mjs';

describe('brand guide', () => {
  it('finds BRAND_GUIDE.md and extracts hex colors', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-guide-'));
    fs.writeFileSync(
      path.join(dir, 'BRAND_GUIDE.md'),
      '# Brand\n\nColors: #112233 and #abcdef\nLogo: `src/assets/logo.svg`\n\n## Voice\nWarm and direct.\n'
    );
    const guide = findBrandGuide(dir);
    assert.equal(guide.found, true);
    assert.ok(guide.colors.includes('#112233'));
    assert.ok(guide.logoHints.some((h) => h.includes('logo.svg')));
  });

  it('reports color drift vs profile', () => {
    const drifts = brandGuideColorDrift(
      { colors: { accent: '#ff0000' } },
      { colors: ['#112233'] }
    );
    assert.equal(drifts.length, 1);
    assert.match(drifts[0], /accent=#ff0000/);
  });
});
