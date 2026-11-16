// ./Web_Toolkit/site_theme/src/lib/derive.mjs
/**
 * Turns measurements taken from a rendered page into contract tokens (pure; the browser part lives in extract.mjs).
 * Every token records how it was obtained: measured from the page, derived from measured values, or defaulted from the
 * toolkit contract, so a human can see what to hand-tune. Contrast-critical pairs are repaired, not trusted.
 */

import { contrast, luminance, mix, over, parseColor, saturation, toHex } from './color.mjs';

const DEFAULTS = { '--space-1': '0.25rem', '--space-2': '0.5rem', '--space-3': '1rem', '--space-4': '1.5rem', '--space-5': '2rem', '--space-6': '3rem', '--space-7': '5rem', '--ease-out': 'cubic-bezier(0.22, 1, 0.36, 1)', '--dur-fast': '160ms', '--dur-mid': '320ms', '--dur-slow': '640ms', '--max-width-content': '72rem', '--line-height-body': '1.6', '--header-height': '4rem' };

function mostCommon(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Push `color` toward black or white until it reaches `min`:1 against `background` (keeps hue, changes lightness only). */
export function repairContrast(color, background, min) {
  const fg = parseColor(color);
  const bg = parseColor(background);
  if (!fg || !bg) return color;
  if (contrast(fg, bg) >= min) return toHex(fg);
  const target = luminance(bg) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  for (let step = 1; step <= 100; step += 1) {
    const candidate = mix(fg, target, step / 100);
    if (contrast(candidate, bg) >= min) return toHex(candidate);
  }
  return toHex(target);
}

/**
 * @param {object} samples
 * @param {string} samples.bodyBg @param {string} samples.bodyColor
 * @param {string[]} samples.surfaceBgs @param {string[]} samples.mutedColors @param {string[]} samples.linkColors
 * @param {string[]} samples.buttonBgs @param {string[]} samples.borderColors
 * @param {{ display?: string, sans?: string, mono?: string }} samples.fonts @param {string[]} samples.radii (px numbers as strings)
 */
export function deriveTokens(samples) {
  const how = {};
  const tokens = {};
  const set = (name, value, source) => { tokens[name] = value; how[name] = source; };

  const bg = parseColor(samples.bodyBg) && (parseColor(samples.bodyBg)[3] ?? 1) > 0.5 ? parseColor(samples.bodyBg) : [255, 255, 255, 1];
  const bgHex = toHex(bg);
  const dark = luminance(bg) < 0.4;
  set('--color-bg', bgHex, parseColor(samples.bodyBg) ? 'measured' : 'defaulted');

  const text = parseColor(samples.bodyColor) ?? (dark ? [236, 237, 240] : [26, 26, 26]);
  set('--color-text', repairContrast(toHex(text), bgHex, 4.5), contrast(over(text, bg), bg) >= 4.5 ? 'measured' : 'repaired');

  const surfaceCandidate = mostCommon(samples.surfaceBgs.map((c) => parseColor(c)).filter((c) => c && (c[3] ?? 1) > 0.9).map(toHex).filter((hex) => hex !== bgHex));
  const surface = surfaceCandidate ?? toHex(mix(bg, dark ? [255, 255, 255] : [0, 0, 0], 0.05));
  set('--color-surface', surface, surfaceCandidate ? 'measured' : 'derived');
  set('--color-surface-raised', toHex(mix(parseColor(surface), dark ? [255, 255, 255] : [255, 255, 255], dark ? 0.06 : 0.6)), 'derived');

  const mutedCandidate = mostCommon(samples.mutedColors.map((c) => parseColor(c)).filter(Boolean).map(toHex));
  const mutedBase = mutedCandidate ?? toHex(mix(parseColor(tokens['--color-text']), bg, 0.35));
  const worstSurface = parseColor(surface);
  const mutedRepaired = repairContrast(repairContrast(mutedBase, bgHex, 4.5), toHex(worstSurface), 4.5);
  set('--color-text-muted', mutedRepaired, mutedCandidate && mutedRepaired === mutedBase ? 'measured' : mutedCandidate ? 'repaired' : 'derived');

  const linkCandidate = mostCommon(samples.linkColors.map((c) => parseColor(c)).filter((c) => c && saturation(c) > 0.2).map(toHex));
  set('--color-link', repairContrast(linkCandidate ?? (dark ? '#7db4ff' : '#0b5cad'), bgHex, 4.5), linkCandidate ? 'measured' : 'defaulted');

  const accentCandidate = mostCommon(samples.buttonBgs.map((c) => parseColor(c)).filter((c) => c && (c[3] ?? 1) > 0.9 && saturation(c) > 0.25).map(toHex));
  const accent = accentCandidate ?? tokens['--color-link'];
  set('--color-accent', accent, accentCandidate ? 'measured' : 'derived');
  const light = '#ffffff';
  const darkText = '#0b0b0b';
  set('--color-accent-contrast', contrast(parseColor(light), parseColor(accent)) >= contrast(parseColor(darkText), parseColor(accent)) ? light : darkText, 'derived');
  if (contrast(parseColor(tokens['--color-accent-contrast']), parseColor(accent)) < 4.5) set('--color-accent', repairContrast(accent, tokens['--color-accent-contrast'], 4.5), 'repaired');

  const borderCandidate = mostCommon(samples.borderColors.map((c) => parseColor(c)).filter((c) => c && (c[3] ?? 1) > 0.05).map((c) => toHex(over(c, bg))));
  set('--color-border', borderCandidate ?? toHex(mix(bg, dark ? [255, 255, 255] : [0, 0, 0], 0.16)), borderCandidate ? 'measured' : 'derived');
  // Control edges need 3:1 (WCAG 1.4.11): walk from the muted text color toward the page color while it still clears 3.2:1 on both surfaces.
  {
    const base = parseColor(tokens['--color-text-muted']);
    const surfaceRgb = over(parseColor(tokens['--color-surface']), bg);
    let edge = base;
    for (let step = 0; step <= 100; step += 1) {
      const candidate = mix(base, bg, step / 100);
      if (contrast(candidate, bg) >= 3.2 && contrast(candidate, surfaceRgb) >= 3.2) edge = candidate; else break;
    }
    set('--color-border-strong', toHex(edge), 'derived');
  }
  set('--color-focus', repairContrast(tokens['--color-link'], bgHex, 3), 'derived');
  // Status colors are not measurable from a page reliably; use accessible defaults repaired against both surfaces.
  const status = (name, light, darkValue) => set(name, repairContrast(repairContrast(dark ? darkValue : light, bgHex, 4.5), tokens['--color-surface'], 4.5), 'defaulted');
  status('--color-danger', '#b42318', '#f97066');
  status('--color-success', '#067647', '#4ade80');

  const font = (name, value, fallback) => set(name, value || fallback, value ? 'measured' : 'defaulted');
  const sans = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  font('--font-sans', samples.fonts?.sans, sans);
  font('--font-display', samples.fonts?.display, samples.fonts?.sans || sans);
  font('--font-mono', samples.fonts?.mono, 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace');

  const radius = Number.parseFloat(mostCommon(samples.radii)) || 8;
  const rem = (px) => `${Math.max(0, Number((px / 16).toFixed(3)))}rem`;
  set('--radius-md', rem(radius), samples.radii?.length ? 'measured' : 'defaulted');
  set('--radius-sm', rem(radius / 2), 'derived');
  set('--radius-lg', rem(radius * 2), 'derived');
  const shadow = dark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.12)';
  set('--shadow-soft', `0 8px 24px ${shadow}`, 'defaulted');
  set('--shadow-raised', `0 16px 48px ${dark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.2)'}`, 'defaulted');
  for (const [name, value] of Object.entries(DEFAULTS)) set(name, value, 'defaulted');
  return { tokens, how, scheme: dark ? 'dark' : 'light' };
}

/** Guess which of a site's own custom properties play each contract role (for `compare --map` on un-normalized sites). */
export function suggestMap(siteVariables) {
  const roles = {
    '--color-bg': [/^--(color-)?(bg|background|paper|base|bg-base|canvas)$/, /bg-base$/, /^--color-(cream|paper)$/],
    '--color-surface': [/^--(color-)?(surface|card|panel|bg-surface)$/, /surface$/],
    '--color-surface-raised': [/surface-(raised|2|elevated)$/, /raised$/],
    '--color-text': [/^--(color-)?(text|fg|foreground|ink|text-primary)$/, /text-primary$/],
    '--color-text-muted': [/^--(color-)?(text-muted|muted|text-secondary|secondary-text)$/, /(text|ink)-(muted|secondary|soft)$/],
    '--color-link': [/^--(color-)?link$/],
    '--color-accent': [/^--(color-)?(accent|brand|primary)$/],
    '--color-accent-contrast': [/^--(on-(brand|accent|primary)|accent-contrast|brand-contrast|text-on-(brand|accent|primary))$/],
    '--color-border': [/^--(color-)?(border|line|divider|stroke)$/],
    '--color-focus': [/^--(color-)?(focus|focus-ring|ring)$/],
    '--shadow-soft': [/^--shadow(-soft|-sm|-md)?$/],
    '--radius-md': [/^--radius(-md)?$/],
    '--font-sans': [/^--font-(sans|body)$/],
    '--font-display': [/^--font-(display|heading|serif)$/],
    '--font-mono': [/^--font-mono$/]
  };
  const map = {};
  for (const [role, patterns] of Object.entries(roles)) {
    for (const pattern of patterns) {
      const hit = siteVariables.find((name) => pattern.test(name) && !(name in map) && name !== role);
      if (hit) { map[role] = hit; break; }
    }
  }
  return map;
}

/**
 * Better than names alone: match the site's own custom properties to contract roles by their RESOLVED values
 * (a variable whose color equals the measured page background is the background role), using names only to break ties.
 * @param {Record<string, string>} siteVariables name -> value as declared on :root
 * @param {Record<string, string>} measured contract tokens measured from the page (deriveTokens(...).tokens)
 * @param {Record<string, string>} how provenance per token ('measured' | 'derived' | ...); only measured ones are matched
 */
export function suggestMapByValue(siteVariables, measured, how = {}) {
  const byName = suggestMap(Object.keys(siteVariables));
  const hex = (value) => { const parsed = parseColor(value); return parsed ? toHex(parsed) : null; };
  const map = {};
  for (const role of Object.keys(measured)) {
    if (how[role] && how[role] !== 'measured') continue;
    const target = role.startsWith('--color-') ? hex(measured[role]) : (role.startsWith('--font-') ? firstFamily(measured[role]) : null);
    if (!target) continue;
    const matches = Object.entries(siteVariables)
      .filter(([, value]) => (role.startsWith('--color-') ? hex(value) === target : firstFamily(value) === target))
      .map(([name]) => name);
    if (matches.length === 0) continue;
    map[role] = matches.includes(byName[role]) ? byName[role] : matches[0];
  }
  // Roles that were not measured (or have no value match) fall back to the name-based guess.
  for (const [role, name] of Object.entries(byName)) if (!(role in map)) map[role] = name;
  return map;
}

function firstFamily(value) {
  const first = String(value).split(',')[0]?.trim().replace(/^["']|["']$/g, '').toLowerCase();
  return first || null;
}

/** theme-map.json (or the flat suggested map) -> { role: [siteVars...] } with only contract tokens kept. */
export function normalizeMap(document, contractNames) {
  const raw = document && typeof document === 'object' && document.map && typeof document.map === 'object' ? document.map : document;
  const out = {};
  for (const [role, value] of Object.entries(raw ?? {})) {
    if (!contractNames.includes(role)) continue;
    const vars = (Array.isArray(value) ? value : [value]).filter((name) => typeof name === 'string' && /^--[\w-]+$/.test(name));
    if (vars.length > 0) out[role] = vars;
  }
  return out;
}

/** CSS that points the site's own variables at the active theme's contract tokens (specificity beats the site's :root). */
export function buildCompatCss(map, siteName = 'this site') {
  const lines = Object.entries(map).flatMap(([role, vars]) => vars.map((name) => `  ${name}: var(${role});`));
  return `/* Generated by site-theme apply: maps ${siteName}'s own variables onto the theme contract so existing components pick up any theme.\n   Edit theme-map.json, not this file. Components that hardcode colors are NOT themed; run site-theme compare to find them. */\n:root[data-theme] {\n${lines.join('\n')}\n}\n`;
}
