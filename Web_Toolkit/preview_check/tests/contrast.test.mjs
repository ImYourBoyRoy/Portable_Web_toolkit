// ./Web_Toolkit/preview_check/tests/contrast.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compose, contrastRatio, gradientColors, isLargeText, parseColor, resolveBackground } from '../src/lib/contrast.mjs';

describe('contrast math', () => {
  it('matches the WCAG reference values', () => {
    assert.ok(Math.abs(contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 1e-6);
    assert.ok(Math.abs(contrastRatio([119, 119, 119], [255, 255, 255]) - 4.48) < 0.02);
  });
  it('parses rgb, rgba and color(srgb) forms', () => {
    assert.deepEqual(parseColor('rgb(10, 20, 30)'), [10, 20, 30, 1]);
    assert.deepEqual(parseColor('rgba(10, 20, 30, 0.5)'), [10, 20, 30, 0.5]);
    const srgb = parseColor('color(srgb 1 0.5 0 / 0.25)');
    assert.deepEqual(srgb.map((v) => Math.round(v * 100) / 100), [255, 127.5, 0, 0.25]);
    assert.equal(parseColor('oklch(0.5 0.1 200)'), null);
  });
  it('composites translucent layers and flags image layers as uncertain', () => {
    const solid = resolveBackground([{ color: 'rgba(255,255,255,0.5)', image: false }, { color: 'rgb(0,0,0)', image: false }]);
    assert.deepEqual(solid.color.map(Math.round), [128, 128, 128]);
    assert.equal(solid.uncertain, false);
    assert.equal(resolveBackground([{ color: 'rgba(0,0,0,0)', image: true }]).uncertain, true);
  });
  it('catches white text on a pale gold button', () => {
    const button = resolveBackground([{ color: 'rgb(214, 185, 135)', image: false }]);
    assert.ok(contrastRatio([255, 255, 255], button.color) < 2);
    assert.equal(compose([0, 0, 0, 1], button.color)[0], 0);
  });
  it('treats 24px, or 18.66px bold, as large text', () => {
    assert.equal(isLargeText(24, 400), true);
    assert.equal(isLargeText(19, 700), true);
    assert.equal(isLargeText(16, 700), false);
  });

  it('evaluates each stop of an opaque gradient instead of guessing', () => {
    const gradient = 'linear-gradient(135deg, color(srgb 0.97 0.95 0.91), rgb(222, 205, 170))';
    assert.equal(gradientColors(gradient).length, 2);
    const resolved = resolveBackground([{ color: 'rgba(0, 0, 0, 0)', image: true, imageText: gradient }], [8, 8, 13]);
    assert.equal(resolved.candidates.length, 2);
    assert.equal(resolved.uncertain, false);
    // dark text passes on every stop, white text fails on every stop
    assert.ok(resolved.candidates.every((bg) => contrastRatio([17, 17, 24], bg) >= 4.5));
    assert.ok(resolved.candidates.every((bg) => contrastRatio([255, 255, 255], bg) < 2));
  });
});
