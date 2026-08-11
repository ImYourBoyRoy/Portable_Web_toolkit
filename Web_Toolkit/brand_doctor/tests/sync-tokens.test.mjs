// ./Web_Toolkit/brand_doctor/tests/sync-tokens.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapGuideColorsToTokens } from '../src/commands/sync-tokens.mjs';

describe('mapGuideColorsToTokens', () => {
  it('maps labeled colors and fills remaining slots', () => {
    const raw = `
# Brand
Primary: #112233
Accent: #aabbcc
#445566
#778899
`;
    const mapped = mapGuideColorsToTokens(raw, ['#112233', '#aabbcc', '#445566', '#778899']);
    const byToken = Object.fromEntries(mapped.map((e) => [e.token, e.hex]));
    assert.equal(byToken['color-brand-primary'], '#112233');
    assert.equal(byToken['color-brand-accent'], '#aabbcc');
    assert.ok(Object.keys(byToken).length >= 3);
  });
});
