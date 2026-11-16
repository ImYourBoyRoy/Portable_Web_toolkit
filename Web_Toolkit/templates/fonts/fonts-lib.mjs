// ./Web_Toolkit/templates/fonts/fonts-lib.mjs
/**
 * Pure functions behind sync-fonts.mjs: config validation, face planning, @font-face generation, fallback metric math
 * and manifest assembly. No filesystem, no network, no clock, so the same input always yields the same bytes and
 * tests can import everything directly.
 */

import { createHash } from 'node:crypto';

export const SCHEMA_VERSION = 1;
export const DISPLAY_VALUES = Object.freeze(['auto', 'block', 'swap', 'fallback', 'optional']);
export const STYLE_VALUES = Object.freeze(['normal', 'italic']);
export const ROLE_VALUES = Object.freeze(['display', 'sans', 'mono']);
export const FALLBACK_KINDS = Object.freeze(['sans-serif', 'serif', 'monospace']);
export const MAX_PRELOAD_FILES = 2;

export const DEFAULTS = Object.freeze({
  outDir: 'public/fonts',
  cssOut: 'src/styles/fonts.generated.css',
  manifestOut: 'src/styles/fonts.manifest.json',
  display: 'swap',
  subsets: Object.freeze(['latin']),
  weightRange: Object.freeze([100, 900]),
  axis: 'wght'
});

/** unicode-range per fontsource subset (the same ranges Google Fonts publishes). */
export const SUBSET_RANGES = Object.freeze({
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  cyrillic: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
  'cyrillic-ext': 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
  greek: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF',
  'greek-ext': 'U+1F00-1FFF',
  vietnamese: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB'
});

/**
 * Metrics of the system font each fallback face is matched against. Arial, Times New Roman and Courier New share
 * vertical metrics and advance widths with the metric-compatible Liberation fonts, which is what the xWidthAvg values
 * were measured on, using the same weighted-width reader (woff2-metrics.mjs) that measures the web font. Same method on
 * both sides keeps size-adjust consistent. `local` lists the installed names that carry those metrics per platform.
 */
export const SYSTEM_FALLBACKS = Object.freeze({
  'sans-serif': Object.freeze({
    name: 'Arial',
    local: Object.freeze(['Arial', 'Helvetica', 'Liberation Sans', 'Arimo']),
    metrics: Object.freeze({ unitsPerEm: 2048, ascent: 1854, descent: -434, lineGap: 67, xWidthAvg: 915 }),
    stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  }),
  serif: Object.freeze({
    name: 'Times New Roman',
    local: Object.freeze(['Times New Roman', 'Times', 'Liberation Serif', 'Tinos']),
    metrics: Object.freeze({ unitsPerEm: 2048, ascent: 1825, descent: -443, lineGap: 87, xWidthAvg: 830 }),
    stack: 'Georgia, "Times New Roman", serif'
  }),
  monospace: Object.freeze({
    name: 'Courier New',
    local: Object.freeze(['Courier New', 'Courier', 'Liberation Mono', 'Cousine']),
    metrics: Object.freeze({ unitsPerEm: 2048, ascent: 1705, descent: -615, lineGap: 0, xWidthAvg: 1229 }),
    stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  })
});

const FAMILY_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .+&'-]{0,63}$/;
const SUBSET_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AXIS_RE = /^[a-z]{2,8}$/;
const TOP_KEYS = new Set(['$schema', '$comment', 'outDir', 'cssOut', 'manifestOut', 'urlBase', 'display', 'subsets', 'families']);
const FAMILY_KEYS = new Set(['$comment', 'family', 'id', 'package', 'role', 'fallback', 'variable', 'weights', 'weightRange', 'axis', 'styles', 'subsets', 'display', 'media', 'preload', 'preloadWeights', 'metrics']);
const PACKAGE_RE = /^(?:@[a-z0-9][a-z0-9-]*\/)?[a-z0-9][a-z0-9-]*$/;

export function slugify(family) {
  return String(family).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function fontsourcePackage(slug, variable) {
  return variable ? `@fontsource-variable/${slug}` : `@fontsource/${slug}`;
}

/** Install command suggestion for a set of packages. `manager` is 'pnpm' | 'npm' | 'yarn' | 'bun' | undefined. */
export function installCommand(packages, manager) {
  const list = [...new Set(packages)].sort().join(' ');
  switch (manager) {
    case 'pnpm': return `pnpm add ${list}`;
    case 'yarn': return `yarn add ${list}`;
    case 'bun': return `bun add ${list}`;
    case 'npm': return `npm install ${list}`;
    default: return `pnpm add ${list}   (or: npm install ${list})`;
  }
}

function isRelativeInside(value) {
  return typeof value === 'string' && value.length > 0 && !/^([a-zA-Z]:)?[\\/]/.test(value)
    && !value.split(/[\\/]/).includes('..');
}

function deriveUrlBase(outDir) {
  const normalized = outDir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return normalized.startsWith('public/') ? `/${normalized.slice('public/'.length)}` : null;
}

function isWeight(value) {
  return Number.isInteger(value) && value >= 1 && value <= 1000;
}

/**
 * Validates a raw fonts.config.json object and returns { valid, errors, warnings, config }.
 * `config` is the fully normalized form (every default resolved) and is null when invalid.
 */
export function validateConfig(raw) {
  const errors = [];
  const warnings = [];
  const fail = (path, message) => errors.push(`${path}: ${message}`);

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['config: must be a JSON object with a "families" array'], warnings, config: null };
  }

  for (const key of Object.keys(raw)) {
    if (!TOP_KEYS.has(key)) warnings.push(`${key}: unknown config key, ignored`);
  }

  const outDir = raw.outDir ?? DEFAULTS.outDir;
  const cssOut = raw.cssOut ?? DEFAULTS.cssOut;
  const manifestOut = raw.manifestOut ?? DEFAULTS.manifestOut;
  for (const [key, value] of [['outDir', outDir], ['cssOut', cssOut], ['manifestOut', manifestOut]]) {
    if (!isRelativeInside(value)) fail(key, 'must be a relative path inside the project (no leading slash, no "..")');
  }
  let urlBase = raw.urlBase ?? (isRelativeInside(outDir) ? deriveUrlBase(outDir) : null);
  if (urlBase === null || urlBase === undefined) {
    fail('urlBase', 'required when outDir is not under public/ (for example "/assets/fonts")');
  } else if (typeof urlBase !== 'string' || !urlBase.startsWith('/') || /\s|["'()]/.test(urlBase)) {
    fail('urlBase', 'must be a site-root path such as "/fonts"');
  } else {
    urlBase = urlBase.replace(/\/+$/, '');
  }

  const display = raw.display ?? DEFAULTS.display;
  if (!DISPLAY_VALUES.includes(display)) fail('display', `must be one of ${DISPLAY_VALUES.join(', ')}`);
  if (display === 'block') warnings.push('display: "block" hides text for up to 3s while the font loads; prefer "swap" (critical) or "optional" (decorative)');

  const subsets = raw.subsets ?? DEFAULTS.subsets;
  const checkSubsets = (path, value) => {
    if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || !SUBSET_RE.test(entry))) {
      fail(path, 'must be a non-empty array of subset names such as ["latin"]');
      return false;
    }
    if (new Set(value).size !== value.length) fail(path, 'contains duplicates');
    for (const entry of value) {
      if (!SUBSET_RANGES[entry]) warnings.push(`${path}: no built-in unicode-range for "${entry}"; its @font-face is emitted without one`);
    }
    return true;
  };
  checkSubsets('subsets', subsets);

  if (!Array.isArray(raw.families) || raw.families.length === 0) {
    fail('families', 'must be a non-empty array');
    return { valid: false, errors, warnings, config: null };
  }

  const seen = new Set();
  const families = raw.families.map((entry, index) => {
    const at = `families[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(at, 'must be an object with at least a "family" name');
      return null;
    }
    for (const key of Object.keys(entry)) {
      if (!FAMILY_KEYS.has(key)) warnings.push(`${at}.${key}: unknown key, ignored (did you mean "weights" or "weightRange"?)`);
    }
    const name = entry.family;
    if (typeof name !== 'string' || !FAMILY_NAME_RE.test(name)) {
      fail(`${at}.family`, 'must be a family name such as "DM Sans" (letters, digits, spaces; no quotes)');
      return null;
    }
    const slug = entry.id ?? slugify(name);
    if (!SUBSET_RE.test(slug)) fail(`${at}.id`, 'must be a fontsource id such as "dm-sans"');
    if (seen.has(name)) fail(`${at}.family`, `"${name}" is listed twice`);
    seen.add(name);

    if (entry.package !== undefined && (typeof entry.package !== 'string' || !PACKAGE_RE.test(entry.package))) {
      fail(`${at}.package`, 'must be an npm package name such as "@fontsource/dm-sans"');
    }
    const variable = entry.variable === true;
    if (entry.variable !== undefined && typeof entry.variable !== 'boolean') fail(`${at}.variable`, 'must be true or false');

    const styles = entry.styles ?? ['normal'];
    if (!Array.isArray(styles) || styles.length === 0 || styles.some((value) => !STYLE_VALUES.includes(value)) || new Set(styles).size !== styles.length) {
      fail(`${at}.styles`, `must be a non-empty list of unique values from ${STYLE_VALUES.join(', ')}`);
    }

    let weights = null;
    let weightRange = null;
    if (variable) {
      weightRange = entry.weightRange ?? [...DEFAULTS.weightRange];
      if (!Array.isArray(weightRange) || weightRange.length !== 2 || !weightRange.every(isWeight) || weightRange[0] > weightRange[1]) {
        fail(`${at}.weightRange`, 'must be [min, max] such as [100, 900]');
      }
      if (entry.weights !== undefined) fail(`${at}.weights`, 'a variable family uses "weightRange", not "weights"');
    } else {
      weights = entry.weights;
      if (!Array.isArray(weights) || weights.length === 0 || !weights.every(isWeight) || new Set(weights).size !== weights.length) {
        fail(`${at}.weights`, 'required for a static family: unique integers such as [400, 700] (or set "variable": true)');
      } else {
        weights = [...weights].sort((left, right) => left - right);
        if (weights.length > 4) warnings.push(`${at}.weights: ${weights.length} weights; every weight is a request, consider a variable family`);
      }
      if (entry.weightRange !== undefined) fail(`${at}.weightRange`, 'only valid with "variable": true');
    }

    const familySubsets = entry.subsets ?? subsets;
    if (entry.subsets !== undefined) checkSubsets(`${at}.subsets`, familySubsets);

    const familyDisplay = entry.display ?? display;
    if (!DISPLAY_VALUES.includes(familyDisplay)) fail(`${at}.display`, `must be one of ${DISPLAY_VALUES.join(', ')}`);

    const role = entry.role ?? 'sans';
    if (!ROLE_VALUES.includes(role)) fail(`${at}.role`, `must be one of ${ROLE_VALUES.join(', ')}`);
    const fallback = entry.fallback ?? (role === 'mono' ? 'monospace' : 'sans-serif');
    if (!FALLBACK_KINDS.includes(fallback)) fail(`${at}.fallback`, `must be one of ${FALLBACK_KINDS.join(', ')}`);

    const axis = entry.axis ?? DEFAULTS.axis;
    if (!AXIS_RE.test(axis)) fail(`${at}.axis`, 'must be a fontsource axis token such as "wght"');

    if (entry.media !== undefined && (typeof entry.media !== 'string' || !/^\(.+\)$/.test(entry.media.trim()) || /[{};]/.test(entry.media))) {
      fail(`${at}.media`, 'must be a media condition in parentheses, e.g. "(min-width: 641px)"');
    }

    const preload = entry.preload === true;
    if (entry.preload !== undefined && typeof entry.preload !== 'boolean') fail(`${at}.preload`, 'must be true or false');
    let preloadWeights = entry.preloadWeights ?? null;
    if (preloadWeights !== null) {
      const available = variable ? null : weights;
      if (variable || !Array.isArray(preloadWeights) || preloadWeights.some((value) => !available?.includes(value))) {
        fail(`${at}.preloadWeights`, variable ? 'not used with a variable family (its single file is preloaded)' : 'must list weights that are also in "weights"');
      }
    }

    let metrics = null;
    if (entry.metrics !== undefined) {
      const value = entry.metrics;
      const ok = value && typeof value === 'object'
        && Number.isFinite(value.unitsPerEm) && value.unitsPerEm > 0
        && Number.isFinite(value.ascent) && Number.isFinite(value.descent)
        && Number.isFinite(value.xWidthAvg) && value.xWidthAvg > 0;
      if (!ok) fail(`${at}.metrics`, 'needs numeric unitsPerEm, ascent, descent, xWidthAvg (lineGap optional); omit it to measure the font file');
      else metrics = { unitsPerEm: value.unitsPerEm, ascent: value.ascent, descent: -Math.abs(value.descent), lineGap: Number.isFinite(value.lineGap) ? value.lineGap : 0, xWidthAvg: value.xWidthAvg };
    }

    return {
      family: name,
      slug,
      package: entry.package ?? fontsourcePackage(slug, variable),
      variable,
      weights,
      weightRange: variable ? weightRange : null,
      styles: Array.isArray(styles) ? [...styles] : ['normal'],
      subsets: Array.isArray(familySubsets) ? [...familySubsets] : [],
      display: familyDisplay,
      role,
      fallback,
      axis,
      media: entry.media ? entry.media.trim() : null,
      preload,
      preloadWeights: preloadWeights ? [...preloadWeights] : null,
      metrics
    };
  });

  if (errors.length > 0) return { valid: false, errors, warnings, config: null };

  const config = {
    schemaVersion: SCHEMA_VERSION,
    outDir: outDir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''),
    cssOut: cssOut.replace(/\\/g, '/').replace(/^\.\//, ''),
    manifestOut: manifestOut.replace(/\\/g, '/').replace(/^\.\//, ''),
    urlBase,
    display,
    subsets: [...subsets],
    families
  };

  const preloadCount = planFaces(config).filter((face) => face.preload).length;
  if (preloadCount > MAX_PRELOAD_FILES) {
    errors.push(`preload: ${preloadCount} font files are marked for preload; keep it to ${MAX_PRELOAD_FILES} (only what paints the LCP text). Narrow "preloadWeights" or preload fewer families.`);
    return { valid: false, errors, warnings, config: null };
  }
  return { valid: true, errors, warnings, config };
}

/** Parses config file text with a message an agent can act on. */
export function parseConfigText(text, label = 'fonts.config.json') {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

/**
 * Expands a normalized config into one entry per woff2 file, in deterministic order:
 * families as listed, then styles as listed, weights ascending, subsets as listed.
 */
export function planFaces(config) {
  const faces = [];
  config.families.forEach((family, familyIndex) => {
    const weightList = family.variable ? [null] : family.weights;
    const defaultPreload = family.variable ? [null] : [family.weights.includes(400) ? 400 : family.weights[0]];
    const preloadList = family.preloadWeights ?? defaultPreload;
    family.styles.forEach((style) => {
      weightList.forEach((weight) => {
        family.subsets.forEach((subset, subsetIndex) => {
          const sourceBase = family.variable
            ? `${family.slug}-${subset}-${family.axis}-${style}`
            : `${family.slug}-${subset}-${weight}-${style}`;
          faces.push({
            family: family.family,
            familyIndex,
            slug: family.slug,
            package: family.package,
            variable: family.variable,
            subset,
            style,
            weight: family.variable ? `${family.weightRange[0]} ${family.weightRange[1]}` : String(weight),
            sourceName: `${sourceBase}.woff2`,
            baseName: sourceBase,
            display: family.display,
            media: family.media,
            role: family.role,
            preload: family.preload && style === 'normal' && subsetIndex === 0 && preloadList.includes(weight)
          });
        });
      });
    });
  });
  return faces;
}

/** Content-hashed output name (`dm-sans-latin-wght-normal.1a2b3c4d.woff2`): safe under immutable caching. */
export function hashedFileName(baseName, buffer) {
  const hash = createHash('sha256').update(buffer).digest('hex');
  return { file: `${baseName}.${hash.slice(0, 8)}.woff2`, sha256: hash };
}

/** The face used to measure fallback metrics: normal style, primary subset, weight nearest 400. */
export function pickMetricsFace(faces) {
  const normal = faces.filter((face) => face.style === 'normal');
  const pool = normal.length > 0 ? normal : faces;
  const first = pool[0]?.subset;
  const subsetPool = pool.filter((face) => face.subset === first);
  return [...subsetPool].sort((left, right) => Math.abs(Number.parseInt(left.weight, 10) - 400) - Math.abs(Number.parseInt(right.weight, 10) - 400))[0] ?? null;
}

const round2 = (value) => Math.round(value * 100) / 100;

export function formatPercent(value) {
  return `${round2(value)}%`;
}

/**
 * Fallback metric math (the method Next.js and Capsize use):
 *   size-adjust       = (web xWidthAvg / web unitsPerEm) / (system xWidthAvg / system unitsPerEm)
 *   ascent-override   = web ascent  / (web unitsPerEm * size-adjust)
 *   descent-override  = |web descent| / (web unitsPerEm * size-adjust)
 *   line-gap-override = web lineGap / (web unitsPerEm * size-adjust)
 * Percentages (rounded to 2 decimals) so the fallback occupies the same box as the web font before the swap.
 */
export function computeFallbackMetrics(web, system) {
  for (const [label, metrics] of [['web', web], ['system', system]]) {
    if (!metrics || !(metrics.unitsPerEm > 0) || !(metrics.xWidthAvg > 0) || !Number.isFinite(metrics.ascent) || !Number.isFinite(metrics.descent)) {
      throw new Error(`computeFallbackMetrics: ${label} metrics need unitsPerEm, xWidthAvg, ascent and descent`);
    }
  }
  const sizeAdjust = (web.xWidthAvg / web.unitsPerEm) / (system.xWidthAvg / system.unitsPerEm);
  const scale = web.unitsPerEm * sizeAdjust;
  return {
    sizeAdjust: round2(sizeAdjust * 100),
    ascentOverride: round2((web.ascent / scale) * 100),
    descentOverride: round2((Math.abs(web.descent) / scale) * 100),
    lineGapOverride: round2(((web.lineGap ?? 0) / scale) * 100)
  };
}

export function fallbackFamilyName(family) {
  return `${family} Fallback`;
}

/** CSS font stack for a theme token: web font, its metric-matched fallback, then the generic system stack. */
export function buildFontStack(family, fallbackKind, hasFallbackFace = true) {
  const parts = [`"${family}"`];
  if (hasFallbackFace) parts.push(`"${fallbackFamilyName(family)}"`);
  parts.push(SYSTEM_FALLBACKS[fallbackKind].stack);
  return parts.join(', ');
}

function indentBlock(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line) => (line ? `${pad}${line}` : line)).join('\n');
}

/** One @font-face rule for a planned face. `url` is the public URL of the hashed file. */
export function generateFontFace(face, url) {
  const lines = [
    '@font-face {',
    `  font-family: "${face.family}";`,
    `  font-style: ${face.style};`,
    `  font-weight: ${face.weight};`,
    `  font-display: ${face.display};`,
    `  src: url("${url}") format("woff2");`
  ];
  if (SUBSET_RANGES[face.subset]) lines.push(`  unicode-range: ${SUBSET_RANGES[face.subset]};`);
  lines.push('}');
  const rule = lines.join('\n');
  return face.media ? `@media ${face.media} {\n${indentBlock(rule, 2)}\n}` : rule;
}

/** The metric-matched fallback @font-face for one family. */
export function generateFallbackFace(family, fallbackKind, metrics) {
  const system = SYSTEM_FALLBACKS[fallbackKind];
  return [
    '@font-face {',
    `  font-family: "${fallbackFamilyName(family)}";`,
    `  src: ${system.local.map((name) => `local("${name}")`).join(', ')};`,
    `  size-adjust: ${formatPercent(metrics.sizeAdjust)};`,
    `  ascent-override: ${formatPercent(metrics.ascentOverride)};`,
    `  descent-override: ${formatPercent(metrics.descentOverride)};`,
    `  line-gap-override: ${formatPercent(metrics.lineGapOverride)};`,
    '}'
  ].join('\n');
}

/**
 * Builds fonts.generated.css.
 * `entries`: [{ family, fallbackKind, fallback: metrics|null, faces: [{ face, url }] }] in config order.
 */
export function generateCss(entries, { cssOut = 'src/styles/fonts.generated.css' } = {}) {
  const blocks = [];
  for (const entry of entries) {
    const rules = [];
    if (entry.fallback) rules.push(generateFallbackFace(entry.family, entry.fallbackKind, entry.fallback));
    for (const { face, url } of entry.faces) rules.push(generateFontFace(face, url));
    blocks.push(`/* ${entry.family} */\n${rules.join('\n\n')}`);
  }
  const header = [
    `/* ./${cssOut}`,
    ' * GENERATED by templates/fonts/sync-fonts.mjs from fonts.config.json. Do not edit; re-run the script.',
    ' * Name these families in the theme font tokens (see fonts.manifest.json "stack" for ready-made values).',
    ' */'
  ].join('\n');
  return `${header}\n\n${blocks.join('\n\n')}\n`;
}

/**
 * Builds fonts.manifest.json content (no timestamps, stable key order).
 * `entries`: same shape as generateCss plus { package, packageVersion, variable, display, role, files: [...] }.
 */
export function buildManifest(config, entries, warnings = []) {
  const families = entries.map((entry) => {
    const files = entry.faces.map(({ face, file, url, bytes, sha256 }) => ({
      file,
      url,
      source: `${face.package}/files/${face.sourceName}`,
      subset: face.subset,
      style: face.style,
      weight: face.weight,
      bytes,
      sha256: sha256.slice(0, 16),
      preload: face.preload,
      ...(face.media ? { media: face.media } : {})
    }));
    return {
      family: entry.family,
      role: entry.role,
      package: entry.package,
      packageVersion: entry.packageVersion ?? null,
      variable: entry.variable,
      display: entry.display,
      fallbackFamily: entry.fallback ? fallbackFamilyName(entry.family) : null,
      fallbackMetrics: entry.fallback ?? null,
      metricsSource: entry.metricsSource ?? null,
      stack: buildFontStack(entry.family, entry.fallbackKind, Boolean(entry.fallback)),
      files
    };
  });
  const allFiles = families.flatMap((family) => family.files);
  const preload = families.flatMap((family) => family.files.filter((file) => file.preload).map((file) => ({
    family: family.family,
    url: file.url,
    weight: file.weight,
    style: file.style,
    subset: file.subset,
    ...(file.media ? { media: file.media } : {})
  })));
  return {
    schemaVersion: SCHEMA_VERSION,
    generator: 'templates/fonts/sync-fonts.mjs',
    outDir: config.outDir,
    urlBase: config.urlBase,
    families,
    preload,
    totals: { files: allFiles.length, bytes: allFiles.reduce((sum, file) => sum + file.bytes, 0) },
    warnings: [...warnings]
  };
}
