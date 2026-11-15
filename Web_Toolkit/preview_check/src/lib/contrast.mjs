// ./Web_Toolkit/preview_check/src/lib/contrast.mjs
/**
 * WCAG contrast math for preview-check.
 *
 * Purpose: compute text/background contrast from the colors a browser reports, including translucent layers.
 * axe-core reports many translucent or gradient backgrounds as "incomplete" (cantTell), so a gate that only counts
 * axe failures can pass a page with white text on a pale button. This module resolves the layers itself.
 * Input:  CSS color strings as returned by getComputedStyle (rgb(), rgba(), color(srgb ...)).
 * Output: sRGB arrays, composited colors and WCAG 2.x contrast ratios.
 */

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Parse a computed CSS color into [r, g, b, a] (0-255, alpha 0-1), or null when it cannot be resolved. */
export function parseColor(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text || text === 'transparent') return [0, 0, 0, 0];
  let match = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (match) {
    const alpha = match[4] === undefined ? 1 : match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
    return [Number(match[1]), Number(match[2]), Number(match[3]), clamp01(alpha)];
  }
  match = text.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (match) {
    const alpha = match[4] === undefined ? 1 : match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
    return [parseFloat(match[1]) * 255, parseFloat(match[2]) * 255, parseFloat(match[3]) * 255, clamp01(alpha)];
  }
  return null;
}

/** Composite a foreground [r,g,b,a] over an opaque background [r,g,b]. */
export function compose(foreground, background) {
  const alpha = foreground[3] ?? 1;
  return [0, 1, 2].map((index) => foreground[index] * alpha + background[index] * (1 - alpha));
}

export function luminance([r, g, b]) {
  const channel = (value) => {
    const v = clamp01(value / 255);
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Pull every parseable color out of a gradient string (rgb(), rgba(), color(srgb ...)). */
export function gradientColors(imageText) {
  const tokens = String(imageText || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/gi) || [];
  return tokens.map((token) => parseColor(token)).filter(Boolean);
}

/**
 * Resolve the effective background from layers listed innermost first ({ color, image, imageText }).
 * A layer with a gradient yields one candidate background per color stop, so the caller can judge the worst and best case.
 * `uncertain` is true when any layer paints an image whose pixels are unknown (a url() image, or a gradient with no
 * parseable stops); `candidates` always holds at least the solid estimate.
 */
export function resolveBackground(layers, pageBase = [8, 8, 13]) {
  let bases = [pageBase];
  let uncertain = false;
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    const parsed = parseColor(layer.color);
    if (parsed === null) { uncertain = true; continue; }
    if (parsed[3] > 0) bases = bases.map((base) => compose(parsed, base));
    if (layer.image) {
      const stops = gradientColors(layer.imageText);
      if (stops.length === 0) { uncertain = true; continue; }
      const paintedOpaque = stops.every((stop) => stop[3] >= 0.98);
      bases = paintedOpaque ? stops.map((stop) => compose(stop, bases[0])) : bases.flatMap((base) => stops.map((stop) => compose(stop, base)));
      if (!paintedOpaque) uncertain = true;
    }
  }
  return { color: bases[0], candidates: bases, uncertain };
}

export const isLargeText = (fontSizePx, fontWeight) => fontSizePx >= 24 || (fontSizePx >= 18.66 && Number(fontWeight) >= 700);
