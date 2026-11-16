// ./Web_Toolkit/templates/fonts/tests/woff2-metrics.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { LETTER_WEIGHTS, parseWoff2, readFontMetrics } from '../woff2-metrics.mjs';
import { buildTtf, buildWoff2 } from './fixtures.mjs';

test('reads vertical metrics and a uniform width from a WOFF2 file', () => {
  const metrics = readFontMetrics(buildWoff2({ unitsPerEm: 1000, ascent: 992, descent: -310, lineGap: 0, defaultWidth: 600 }));
  assert.deepEqual(metrics, { unitsPerEm: 1000, ascent: 992, descent: -310, lineGap: 0, xWidthAvg: 600, xWidthSource: 'hmtx' });
});

test('weights glyph widths by English letter frequency, not by a plain mean', () => {
  const widths = { e: 1000, ' ': 200 };
  const metrics = readFontMetrics(buildWoff2({ defaultWidth: 400, widths }));
  let total = 0;
  let weight = 0;
  for (const [character, share] of Object.entries(LETTER_WEIGHTS)) {
    total += (widths[character] ?? 400) * share;
    weight += share;
  }
  assert.equal(metrics.xWidthAvg, Math.round(total / weight));
  assert.ok(metrics.xWidthAvg !== Math.round((1000 + 200 + (24 * 400)) / 26), 'differs from the unweighted mean');
});

test('reads advance widths from a transformed hmtx table', () => {
  const plain = readFontMetrics(buildWoff2({ defaultWidth: 520 }));
  const transformed = readFontMetrics(buildWoff2({ defaultWidth: 520, transformHmtx: true }));
  assert.equal(transformed.xWidthAvg, plain.xWidthAvg);
});

test('reads plain TrueType the same way as WOFF2', () => {
  const options = { unitsPerEm: 2048, ascent: 1854, descent: -434, lineGap: 67, defaultWidth: 900 };
  assert.deepEqual(readFontMetrics(buildTtf(options)), readFontMetrics(buildWoff2(options)));
});

test('prefers OS/2 typo metrics only when USE_TYPO_METRICS is set', () => {
  const base = { ascent: 900, descent: -250, lineGap: 0, typo: { ascent: 800, descent: -200, lineGap: 10 } };
  assert.equal(readFontMetrics(buildWoff2({ ...base, useTypoMetrics: false })).ascent, 900);
  const typo = readFontMetrics(buildWoff2({ ...base, useTypoMetrics: true }));
  assert.deepEqual([typo.ascent, typo.descent, typo.lineGap], [800, -200, 10]);
});

test('falls back to the win metrics when hhea is empty', () => {
  const metrics = readFontMetrics(buildWoff2({ ascent: 0, descent: 0, win: { ascent: 950, descent: 260 } }));
  assert.deepEqual([metrics.ascent, metrics.descent], [950, -260]);
});

test('parseWoff2 lists the tables and rejects non-WOFF2 input', () => {
  assert.deepEqual([...parseWoff2(buildWoff2()).keys()].sort(), ['OS/2', 'cmap', 'head', 'hhea', 'hmtx']);
  assert.throws(() => parseWoff2(Buffer.from('not a font at all, just text that is long enough to pass the length guard')), /Not a WOFF2/);
  assert.throws(() => readFontMetrics(Buffer.alloc(4)), /Not an sfnt|unusable|Cannot|Invalid|out of range/i);
});
