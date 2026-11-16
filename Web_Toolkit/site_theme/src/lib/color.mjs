// ./Web_Toolkit/site_theme/src/lib/color.mjs
/** Small color toolkit for theme validation and extraction: parse CSS colors, WCAG luminance/contrast, mixing. */

const NAMED = { black: '#000000', white: '#ffffff', transparent: null };

export function parseColor(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text in NAMED) return NAMED[text] ? parseColor(NAMED[text]) : null;
  let match = /^#([0-9a-f]{3,8})$/.exec(text);
  if (match) {
    let hex = match[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)).concat(hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1);
  }
  match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(text);
  if (match) {
    const alpha = match[4] === undefined ? 1 : match[4].endsWith('%') ? Number.parseFloat(match[4]) / 100 : Number.parseFloat(match[4]);
    return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
  }
  match = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(text);
  if (match) {
    const h = Number(match[1]) / 360;
    const s = Number(match[2]) / 100;
    const l = Number(match[3]) / 100;
    const alpha = match[4] === undefined ? 1 : match[4].endsWith('%') ? Number.parseFloat(match[4]) / 100 : Number.parseFloat(match[4]);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t) => {
      let n = t;
      if (n < 0) n += 1;
      if (n > 1) n -= 1;
      if (n < 1 / 6) return p + (q - p) * 6 * n;
      if (n < 1 / 2) return q;
      if (n < 2 / 3) return p + (q - p) * (2 / 3 - n) * 6;
      return p;
    };
    return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255, alpha];
  }
  return null;
}

export function toHex(rgb) {
  return `#${[0, 1, 2].map((index) => Math.round(Math.min(255, Math.max(0, rgb[index]))).toString(16).padStart(2, '0')).join('')}`;
}

function channel(value) {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

export function luminance(rgb) {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite a translucent color over an opaque background. */
export function over(foreground, background) {
  const alpha = foreground[3] ?? 1;
  return [0, 1, 2].map((index) => foreground[index] * alpha + background[index] * (1 - alpha));
}

export function mix(a, b, amount) {
  return [0, 1, 2].map((index) => a[index] + (b[index] - a[index]) * amount);
}

export function saturation(rgb) {
  const max = Math.max(...rgb.slice(0, 3));
  const min = Math.min(...rgb.slice(0, 3));
  return max === 0 ? 0 : (max - min) / max;
}
