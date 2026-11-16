// ./Web_Toolkit/templates/fonts/tests/fonts-lib.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  SYSTEM_FALLBACKS,
  buildFontStack,
  buildManifest,
  computeFallbackMetrics,
  formatPercent,
  generateCss,
  generateFallbackFace,
  generateFontFace,
  hashedFileName,
  installCommand,
  parseConfigText,
  pickMetricsFace,
  planFaces,
  slugify,
  validateConfig
} from '../fonts-lib.mjs';

const example = JSON.parse(readFileSync(new URL('../fonts.config.example.json', import.meta.url), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

test('the shipped example config is valid and normalized', () => {
  const result = validateConfig(example);
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.config.urlBase, '/fonts');
  assert.deepEqual(result.config.subsets, ['latin']);
  const dmSans = result.config.families.find((family) => family.family === 'DM Sans');
  assert.equal(dmSans.package, '@fontsource-variable/dm-sans');
  assert.deepEqual(dmSans.weightRange, [100, 1000]);
  const serif = result.config.families.find((family) => family.family === 'Instrument Serif');
  assert.equal(serif.package, '@fontsource/instrument-serif');
  assert.equal(serif.display, 'swap');
  assert.deepEqual(result.warnings, []);
});

test('validateConfig reports every problem with a path and a fix', () => {
  const bad = validateConfig({
    outDir: '/abs/fonts',
    display: 'sometimes',
    subsets: [],
    families: [
      { family: 'Bad "Name"', weights: [400] },
      { family: 'No Weights' },
      { family: 'Var', variable: true, weights: [400] },
      { family: 'Static', weights: [400, 400] }
    ]
  });
  assert.equal(bad.valid, false);
  assert.equal(bad.config, null);
  const text = bad.errors.join('\n');
  assert.match(text, /outDir: must be a relative path/);
  assert.match(text, /display: must be one of auto, block, swap, fallback, optional/);
  assert.match(text, /subsets: must be a non-empty array/);
  assert.match(text, /families\[0\]\.family/);
  assert.match(text, /families\[1\]\.weights: required for a static family/);
  assert.match(text, /families\[2\]\.weights: a variable family uses "weightRange"/);
  assert.match(text, /families\[3\]\.weights/);
});

test('validateConfig rejects path escapes, duplicate families, and non-object input', () => {
  assert.match(validateConfig({ outDir: '../outside', families: [{ family: 'A', weights: [400] }] }).errors.join(), /outDir/);
  const duplicate = validateConfig({ families: [{ family: 'A', weights: [400] }, { family: 'A', weights: [700] }] });
  assert.match(duplicate.errors.join(), /listed twice/);
  assert.equal(validateConfig(null).valid, false);
  assert.equal(validateConfig({ families: [] }).valid, false);
  assert.throws(() => parseConfigText('{ nope', 'fonts.config.json'), /fonts\.config\.json is not valid JSON/);
});

test('validateConfig needs an explicit urlBase when outDir is outside public/', () => {
  const base = { outDir: 'static/type', families: [{ family: 'A', weights: [400] }] };
  assert.match(validateConfig(base).errors.join(), /urlBase: required/);
  assert.equal(validateConfig({ ...base, urlBase: '/type/' }).config.urlBase, '/type');
});

test('validateConfig caps preloads at two files and warns about unknown keys', () => {
  const config = clone(example);
  config.families = [
    { family: 'A', weights: [400, 700], preload: true, preloadWeights: [400, 700] },
    { family: 'B', variable: true, preload: true }
  ];
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(), /3 font files are marked for preload; keep it to 2/);

  const typo = validateConfig({ famlies: [], families: [{ family: 'A', weights: [400], weight: 700 }] });
  assert.equal(typo.valid, true);
  assert.ok(typo.warnings.some((message) => message.startsWith('famlies:')));
  assert.ok(typo.warnings.some((message) => message.includes('families[0].weight:')));
});

test('validateConfig warns about display "block" and unknown subsets, and validates media and metrics', () => {
  const result = validateConfig({ display: 'block', subsets: ['latin', 'klingon'], families: [{ family: 'A', weights: [400] }] });
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((message) => message.includes('"block"')));
  assert.ok(result.warnings.some((message) => message.includes('klingon')));
  assert.match(validateConfig({ families: [{ family: 'A', weights: [400], media: 'min-width: 641px' }] }).errors.join(), /media/);
  assert.match(validateConfig({ families: [{ family: 'A', weights: [400], metrics: { ascent: 1 } }] }).errors.join(), /metrics/);
  const metrics = validateConfig({ families: [{ family: 'A', weights: [400], metrics: { unitsPerEm: 1000, ascent: 900, descent: 250, xWidthAvg: 480 } }] });
  assert.deepEqual(metrics.config.families[0].metrics, { unitsPerEm: 1000, ascent: 900, descent: -250, lineGap: 0, xWidthAvg: 480 });
});

test('planFaces expands families in a stable order with fontsource file names', () => {
  const { config } = validateConfig(example);
  const faces = planFaces(config);
  assert.deepEqual(faces.map((face) => face.sourceName), [
    'instrument-serif-latin-400-normal.woff2',
    'instrument-serif-latin-400-italic.woff2',
    'dm-sans-latin-wght-normal.woff2',
    'jetbrains-mono-latin-wght-normal.woff2'
  ]);
  assert.deepEqual(faces.map((face) => face.preload), [true, false, true, false]);
  assert.equal(faces[2].weight, '100 1000');
  assert.equal(faces[3].media, '(min-width: 641px)');
  assert.deepEqual(planFaces(config), faces, 'planning twice gives the same plan');
});

test('planFaces preloads the 400 weight by default, otherwise the lightest, or the listed weights', () => {
  const make = (family) => planFaces(validateConfig({ families: [family] }).config).filter((face) => face.preload).map((face) => face.weight);
  assert.deepEqual(make({ family: 'A', weights: [700, 400, 500], preload: true }), ['400']);
  assert.deepEqual(make({ family: 'A', weights: [500, 700], preload: true }), ['500']);
  assert.deepEqual(make({ family: 'A', weights: [400, 700], preload: true, preloadWeights: [700] }), ['700']);
  assert.deepEqual(make({ family: 'A', weights: [400], styles: ['normal', 'italic'], preload: true }), ['400'], 'italic is never preloaded');
});

test('slugify and package names follow fontsource conventions', () => {
  assert.equal(slugify('IBM Plex Sans'), 'ibm-plex-sans');
  assert.equal(slugify("Source Serif 4"), 'source-serif-4');
  const { config } = validateConfig({ families: [{ family: 'Inter', variable: true }, { family: 'Lora', weights: [400] }] });
  assert.deepEqual(config.families.map((family) => family.package), ['@fontsource-variable/inter', '@fontsource/lora']);
});

test('installCommand adapts to the package manager', () => {
  assert.equal(installCommand(['@fontsource/b', '@fontsource/a', '@fontsource/a'], 'pnpm'), 'pnpm add @fontsource/a @fontsource/b');
  assert.equal(installCommand(['@fontsource/a'], 'npm'), 'npm install @fontsource/a');
  assert.match(installCommand(['@fontsource/a']), /pnpm add @fontsource\/a.*npm install @fontsource\/a/);
});

test('hashedFileName is content-addressed and deterministic', () => {
  const one = hashedFileName('dm-sans-latin-wght-normal', Buffer.from('abc'));
  assert.equal(one.file, 'dm-sans-latin-wght-normal.ba7816bf.woff2');
  assert.deepEqual(hashedFileName('dm-sans-latin-wght-normal', Buffer.from('abc')), one);
  assert.notEqual(hashedFileName('dm-sans-latin-wght-normal', Buffer.from('abd')).file, one.file);
});

test('computeFallbackMetrics applies the size-adjust / override formulas', () => {
  // Web font: 1000 upm, avg width 500, ascent 900, descent -300, gap 0 against Arial (2048 upm, avg 915).
  const result = computeFallbackMetrics({ unitsPerEm: 1000, ascent: 900, descent: -300, lineGap: 0, xWidthAvg: 500 }, SYSTEM_FALLBACKS['sans-serif'].metrics);
  const sizeAdjust = (500 / 1000) / (915 / 2048);
  assert.equal(result.sizeAdjust, Math.round(sizeAdjust * 10000) / 100);
  assert.equal(result.ascentOverride, Math.round((900 / (1000 * sizeAdjust)) * 10000) / 100);
  assert.equal(result.descentOverride, Math.round((300 / (1000 * sizeAdjust)) * 10000) / 100);
  assert.equal(result.lineGapOverride, 0);
  // Sanity: a font identical to the system font needs no adjustment.
  const same = computeFallbackMetrics(SYSTEM_FALLBACKS.serif.metrics, SYSTEM_FALLBACKS.serif.metrics);
  assert.deepEqual(same, { sizeAdjust: 100, ascentOverride: 89.11, descentOverride: 21.63, lineGapOverride: 4.25 });
  assert.throws(() => computeFallbackMetrics({ unitsPerEm: 0 }, SYSTEM_FALLBACKS.serif.metrics), /web metrics need/);
  assert.equal(formatPercent(97.6543), '97.65%');
  assert.equal(formatPercent(100), '100%');
});

test('generateFontFace emits display, weight, unicode-range and media wrapping', () => {
  const { config } = validateConfig(example);
  const [serif, , sans, mono] = planFaces(config);
  const css = generateFontFace(serif, '/fonts/instrument-serif-latin-400-normal.abcd1234.woff2');
  assert.match(css, /^@font-face \{\n {2}font-family: "Instrument Serif";\n {2}font-style: normal;\n {2}font-weight: 400;\n {2}font-display: swap;/);
  assert.match(css, /src: url\("\/fonts\/instrument-serif-latin-400-normal\.abcd1234\.woff2"\) format\("woff2"\);/);
  assert.match(css, /unicode-range: U\+0000-00FF,U\+0131/);
  assert.match(generateFontFace(sans, '/fonts/x.woff2'), /font-weight: 100 1000;/);
  const wrapped = generateFontFace(mono, '/fonts/m.woff2');
  assert.match(wrapped, /^@media \(min-width: 641px\) \{\n {2}@font-face \{/);
  assert.match(wrapped, /font-display: optional;/);
  assert.ok(wrapped.endsWith('  }\n}'));
});

test('generateFallbackFace uses local() system fonts and override percentages', () => {
  const css = generateFallbackFace('DM Sans', 'sans-serif', { sizeAdjust: 97.65, ascentOverride: 101.5, descentOverride: 31.75, lineGapOverride: 0 });
  assert.match(css, /font-family: "DM Sans Fallback";/);
  assert.match(css, /src: local\("Arial"\), local\("Helvetica"\), local\("Liberation Sans"\), local\("Arimo"\);/);
  assert.match(css, /size-adjust: 97.65%;/);
  assert.match(css, /ascent-override: 101.5%;/);
  assert.match(css, /descent-override: 31.75%;/);
  assert.match(css, /line-gap-override: 0%;/);
});

test('buildFontStack names the fallback face before the generic stack', () => {
  assert.equal(buildFontStack('DM Sans', 'sans-serif'), '"DM Sans", "DM Sans Fallback", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
  assert.equal(buildFontStack('Lora', 'serif', false), '"Lora", Georgia, "Times New Roman", serif');
});

test('pickMetricsFace picks normal style, primary subset, weight nearest 400', () => {
  const { config } = validateConfig({ subsets: ['latin', 'latin-ext'], families: [{ family: 'A', weights: [200, 500, 900], styles: ['italic', 'normal'] }] });
  const face = pickMetricsFace(planFaces(config));
  assert.deepEqual([face.style, face.subset, face.weight], ['normal', 'latin', '500']);
  assert.equal(pickMetricsFace([]), null);
});

function entriesFor(config) {
  const faces = planFaces(config);
  return config.families.map((family) => ({
    family: family.family,
    role: family.role,
    package: family.package,
    packageVersion: '1.2.3',
    variable: family.variable,
    display: family.display,
    fallbackKind: family.fallback,
    fallback: { sizeAdjust: 100, ascentOverride: 90, descentOverride: 20, lineGapOverride: 0 },
    metricsSource: 'font file (hmtx)',
    faces: faces.filter((face) => face.family === family.family).map((face, index) => ({
      face,
      url: `/fonts/${face.baseName}.deadbeef.woff2`,
      file: `${face.baseName}.deadbeef.woff2`,
      bytes: 1000 + index,
      sha256: 'a'.repeat(64)
    }))
  }));
}

test('generateCss is deterministic, ordered, and starts with a path comment', () => {
  const { config } = validateConfig(example);
  const entries = entriesFor(config);
  const css = generateCss(entries);
  assert.equal(css, generateCss(entries));
  assert.ok(css.startsWith('/* ./src/styles/fonts.generated.css'));
  assert.ok(css.endsWith('}\n'));
  assert.ok(css.indexOf('"Instrument Serif Fallback"') < css.indexOf('font-family: "Instrument Serif";'), 'fallback face first');
  assert.ok(css.indexOf('/* Instrument Serif */') < css.indexOf('/* DM Sans */'));
  assert.equal((css.match(/@font-face/g) ?? []).length, 7, '3 fallback faces + 4 font files');
  assert.doesNotMatch(css, /--[a-z]/, 'generated CSS defines no custom properties');
});

test('buildManifest records sizes, stacks, preload list and totals without timestamps', () => {
  const { config } = validateConfig(example);
  const manifest = buildManifest(config, entriesFor(config), ['note']);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.totals.files, 4);
  assert.equal(manifest.totals.bytes, 1000 + 1001 + 1000 + 1000);
  assert.deepEqual(manifest.preload.map((entry) => entry.family), ['Instrument Serif', 'DM Sans']);
  assert.equal(manifest.preload[0].url, '/fonts/instrument-serif-latin-400-normal.deadbeef.woff2');
  const mono = manifest.families.find((family) => family.family === 'JetBrains Mono');
  assert.equal(mono.files[0].media, '(min-width: 641px)');
  assert.equal(mono.fallbackFamily, 'JetBrains Mono Fallback');
  assert.match(mono.stack, /^"JetBrains Mono", "JetBrains Mono Fallback", ui-monospace/);
  assert.equal(manifest.families[1].packageVersion, '1.2.3');
  assert.deepEqual(manifest.warnings, ['note']);
  assert.doesNotMatch(JSON.stringify(manifest), /\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(buildManifest(config, entriesFor(config), ['note']), manifest);
});
