// ./Web_Toolkit/site_snapshots/src/lib/diff.mjs
/**
 * Tiny perceptual comparison for screenshots.
 *
 * Purpose: decide whether a live page still looks like its stored snapshot without storing pixel diffs.
 * Method: shrink both images to 32x20 grayscale and take the mean absolute difference (0 identical, 1 inverted).
 */

export async function signature(sharp, input) {
  return sharp(input).resize(32, 20, { fit: 'fill' }).grayscale().raw().toBuffer();
}

export function distance(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return sum / (a.length * 255);
}
