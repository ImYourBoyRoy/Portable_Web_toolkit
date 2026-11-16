import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { contrast, parseColor, toHex } from '../src/lib/color.mjs';
import { loadContract, requiredTokens, validateTokens } from '../src/lib/contract.mjs';
import { deriveTokens, repairContrast, suggestMap } from '../src/lib/derive.mjs';
import { renderContactSheet } from '../src/lib/html.mjs';
import { listThemes, parseTokensCss, renderTokensCss } from '../src/lib/theme-files.mjs';
import { BUNDLED_THEMES, runApply, runValidate } from '../src/commands/themes.mjs';

const contract = loadContract();

test('color parsing and WCAG contrast match published values', () => {
  assert.deepEqual(parseColor('#fff').slice(0, 3), [255, 255, 255]);
  assert.deepEqual(parseColor('rgb(10, 20, 30)'), [10, 20, 30, 1]);
  assert.equal(toHex(parseColor('hsl(0, 100%, 50%)')), '#ff0000');
  assert.equal(parseColor('transparent'), null);
  assert.equal(Number(contrast(parseColor('#000'), parseColor('#fff')).toFixed(2)), 21);
});

test('every bundled theme implements the full contract and passes the AA pairs', () => {
  const themes = listThemes(BUNDLED_THEMES);
  assert.deepEqual(themes.map((theme) => theme.meta.name).sort(), ['contrast', 'glass-night', 'ink', 'paper', 'studio']);
  for (const theme of themes) {
    const result = validateTokens(theme.tokens, contract);
    assert.deepEqual(result.errors, [], theme.meta.name);
    assert.equal(result.contrast.length, contract.contrast.length);
    assert.ok(['light', 'dark'].includes(theme.meta.scheme));
    for (const name of requiredTokens(contract)) assert.ok(name in theme.tokens, `${theme.meta.name} missing ${name}`);
  }
  assert.ok(themes.some((theme) => theme.meta.scheme === 'dark') && themes.some((theme) => theme.meta.scheme === 'light'));
});

test('validation reports missing tokens and failing contrast pairs by name', () => {
  const paper = listThemes(BUNDLED_THEMES).find((theme) => theme.meta.name === 'paper');
  const broken = { ...paper.tokens, '--color-text-muted': '#bbbbbb' };
  delete broken['--radius-md'];
  const { errors } = validateTokens(broken, contract);
  assert.ok(errors.some((error) => error === 'missing token --radius-md'));
  assert.ok(errors.some((error) => /--color-text-muted on --color-bg is \d\.\d+:1 \(needs 4\.5:1\)/.test(error)));
  assert.ok(validateTokens({ ...paper.tokens, '--color-bg': 'not-a-color' }, contract).errors.some((error) => /--color-bg is not a color/.test(error)));
});

test('tokens.css round-trips', () => {
  const css = renderTokensCss('demo', { '--color-bg': '#fff', '--font-sans': 'system-ui, "Segoe UI"' }, { scheme: 'dark', header: 'Demo' });
  assert.match(css, /:root\[data-theme="demo"\]/);
  assert.match(css, /color-scheme: dark/);
  assert.deepEqual(parseTokensCss(css, 'demo'), { '--color-bg': '#fff', '--font-sans': 'system-ui, "Segoe UI"' });
  assert.deepEqual(parseTokensCss(css, 'other'), {});
});

test('extraction derives a contract-valid theme from measurements and says how each token was obtained', () => {
  const light = deriveTokens({
    bodyBg: 'rgb(251, 248, 243)', bodyColor: 'rgb(18, 20, 23)',
    surfaceBgs: ['rgb(242, 234, 224)', 'rgb(242, 234, 224)', 'rgba(0, 0, 0, 0)'],
    mutedColors: ['rgb(170, 170, 170)'], linkColors: ['rgb(141, 63, 46)'], buttonBgs: ['rgb(164, 80, 47)'],
    borderColors: ['rgba(18, 20, 23, 0.18)'], fonts: { display: '"Instrument Serif", serif', sans: '"DM Sans", sans-serif', mono: '' }, radii: ['14', '14', '6']
  });
  assert.equal(light.scheme, 'light');
  assert.equal(light.tokens['--color-bg'], '#fbf8f3');
  assert.equal(light.tokens['--color-surface'], '#f2eae0');
  assert.equal(light.how['--color-text-muted'], 'repaired', 'a 1.8:1 muted gray is repaired, not trusted');
  assert.equal(light.tokens['--font-display'], '"Instrument Serif", serif');
  assert.equal(light.how['--font-mono'], 'defaulted');
  assert.equal(light.tokens['--radius-md'], '0.875rem');
  assert.deepEqual(validateTokens(light.tokens, contract).errors, []);

  const dark = deriveTokens({ bodyBg: 'rgb(8, 8, 13)', bodyColor: 'rgb(255, 255, 255)', surfaceBgs: [], mutedColors: [], linkColors: [], buttonBgs: [], borderColors: [], fonts: {}, radii: [] });
  assert.equal(dark.scheme, 'dark');
  assert.deepEqual(validateTokens(dark.tokens, contract).errors, []);
  assert.equal(dark.how['--color-surface'], 'derived');
  assert.ok(contrast(parseColor(repairContrast('#777777', '#ffffff', 4.5)), [255, 255, 255]) >= 4.5);
});

test('role suggestions map an un-normalized site vocabulary onto the contract', () => {
  const map = suggestMap(['--bg-base', '--bg-surface', '--text-primary', '--accent', '--font-body', '--font-display', '--random']);
  assert.equal(map['--color-bg'], '--bg-base');
  assert.equal(map['--color-surface'], '--bg-surface');
  assert.equal(map['--color-text'], '--text-primary');
  assert.equal(map['--color-accent'], '--accent');
  assert.equal(map['--font-sans'], '--font-body');
  assert.ok(!Object.values(map).includes('--random'));
});

test('apply installs themes, an import index, theme data, and the Astro components; validate exits 2 on a failing theme', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'site-theme-'));
  const lines = [];
  runApply(['paper', 'ink'], { 'project-root': project, pair: 'paper,ink' }, (text) => lines.push(text));
  const data = JSON.parse(fs.readFileSync(path.join(project, 'src/data/themes.json'), 'utf8'));
  assert.deepEqual(data.pair, { light: 'paper', dark: 'ink' });
  assert.equal(data.default, 'paper');
  assert.deepEqual(data.available.map((theme) => theme.name), ['ink', 'paper']);
  assert.match(fs.readFileSync(path.join(project, 'src/styles/themes/index.css'), 'utf8'), /@import '\.\/ink\/tokens\.css';/);
  for (const file of ['ThemeInit.astro', 'ThemeToggle.astro', 'ThemePicker.astro']) assert.ok(fs.existsSync(path.join(project, 'src/components/theme', file)), file);
  assert.match(lines.join(''), /<ThemeInit \/> first in <head>/);

  // a second apply adds a theme without dropping the first and keeps the chosen pair/default
  runApply(['studio'], { 'project-root': project }, () => {});
  const again = JSON.parse(fs.readFileSync(path.join(project, 'src/data/themes.json'), 'utf8'));
  assert.deepEqual(again.available.map((theme) => theme.name), ['ink', 'paper', 'studio']);
  assert.deepEqual(again.pair, { light: 'paper', dark: 'ink' });
  assert.throws(() => runApply(['paper'], { 'project-root': project, pair: 'paper,nope' }, () => {}), /unknown theme: nope/);
  assert.throws(() => runApply([], { 'project-root': project }, () => {}), /apply needs theme names/);

  const bad = path.join(project, 'bad');
  fs.mkdirSync(bad);
  fs.writeFileSync(path.join(bad, 'theme.json'), JSON.stringify({ name: 'bad', label: 'Bad', scheme: 'light' }));
  fs.writeFileSync(path.join(bad, 'tokens.css'), ':root[data-theme="bad"] { --color-bg: #fff; --color-text: #eee; }');
  assert.equal(runValidate([bad], { 'project-root': project }, () => {}), 2);
  assert.throws(() => runApply([bad], { 'project-root': project }, () => {}), /fails the token contract/);
  fs.rmSync(project, { recursive: true, force: true });
});

test('contact sheet escapes content, uses relative images, and flags sites that ignore the tokens', () => {
  const html = renderContactSheet({
    site: 'http://127.0.0.1:4321/<x>',
    routes: [{ route: '/', files: { paper: 'paper-home.png', ink: 'ink-home.png' } }],
    themes: [{ name: 'paper', meta: { label: 'Paper', scheme: 'light' } }, { name: 'ink', meta: { label: 'Ink', scheme: 'dark' } }],
    results: { paper: { textFailures: 0, siteReadsTokens: true }, ink: { textFailures: 3, siteReadsTokens: false } }
  });
  assert.match(html, /&lt;x&gt;/);
  assert.match(html, /src="ink-home\.png"/);
  assert.match(html, /3 low-contrast text nodes/);
  assert.match(html, /site does not read the tokens/);
});

import { buildCompatCss, normalizeMap, suggestMapByValue } from '../src/lib/derive.mjs';
import { libraryDir, loadProjectMap, runExport } from '../src/commands/themes.mjs';

test('value-based role matching finds a site variable by what it resolves to, with names as the tie-break', () => {
  const siteVars = { '--zz-weird': '#fbf8f3', '--bg': '#fbf8f3', '--ink': 'rgb(18, 20, 23)', '--serif': '"Instrument Serif", Georgia, serif', '--unrelated': '#123456', '--space-9': '9rem' };
  const measured = { '--color-bg': '#fbf8f3', '--color-text': '#121417', '--font-display': '"Instrument Serif", serif', '--color-accent': '#a4502f' };
  const map = suggestMapByValue(siteVars, measured, { '--color-bg': 'measured', '--color-text': 'measured', '--font-display': 'measured', '--color-accent': 'derived' });
  assert.equal(map['--color-bg'], '--bg', 'two variables resolve to the page background; the one whose name fits wins');
  assert.equal(map['--color-text'], '--ink', 'matched by value even though the name says nothing');
  assert.equal(map['--font-display'], '--serif');
  assert.ok(!('--color-accent' in map), 'derived (not measured) roles have no value match and no name match here');
  const byName = suggestMapByValue({ '--brand': '#a4502f', '--border': '#d9cdbf', '--focus': '#8d3f2e' }, measured, { '--color-accent': 'derived' });
  assert.deepEqual([byName['--color-accent'], byName['--color-border'], byName['--color-focus']], ['--brand', '--border', '--focus'], 'unmeasured roles fall back to names');
});

test('map files normalize (flat, nested, arrays), keep only contract roles, and compile to compat css', () => {
  const names = requiredTokens(contract);
  const map = normalizeMap({ schemaVersion: 1, map: { '--color-bg': ['--bg', '--paper'], '--color-text': '--ink', '--bogus': ['--x'], '--color-link': ['not a var'] } }, names);
  assert.deepEqual(map, { '--color-bg': ['--bg', '--paper'], '--color-text': ['--ink'] });
  assert.deepEqual(normalizeMap({ '--color-bg': '--bg' }, names), { '--color-bg': ['--bg'] });
  const css = buildCompatCss(map, 'demo');
  assert.match(css, /:root\[data-theme\] \{\n  --bg: var\(--color-bg\);\n  --paper: var\(--color-bg\);\n  --ink: var\(--color-text\);\n\}/);
});

test('export puts a theme in the library under any name; apply then installs it with a compat layer on a site with a different vocabulary', () => {
  const library = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-lib-'));
  const previous = process.env.PORTABLE_TOOLKIT_THEMES;
  process.env.PORTABLE_TOOLKIT_THEMES = library;
  try {
    assert.equal(libraryDir(), library);
    const source = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-src-'));
    const studio = listThemes(BUNDLED_THEMES).find((theme) => theme.meta.name === 'studio');
    fs.mkdirSync(path.join(source, 'nomos-draft'));
    fs.writeFileSync(path.join(source, 'nomos-draft', 'theme.json'), JSON.stringify({ ...studio.meta, name: 'nomos-draft', label: 'Nomos draft', source: 'http://127.0.0.1:4000' }));
    fs.writeFileSync(path.join(source, 'nomos-draft', 'tokens.css'), renderTokensCss('nomos-draft', studio.tokens, { scheme: 'light' }));
    const lines = [];
    runExport(['nomos-draft'], { 'project-root': source, source, as: 'Nomos Theme', label: 'Nomos' }, (text) => lines.push(text));
    assert.ok(fs.existsSync(path.join(library, 'nomos-theme', 'tokens.css')));
    const exported = JSON.parse(fs.readFileSync(path.join(library, 'nomos-theme', 'theme.json'), 'utf8'));
    assert.equal(exported.name, 'nomos-theme');
    assert.equal(exported.label, 'Nomos');
    assert.equal(exported.exportedFrom, 'http://127.0.0.1:4000');
    assert.ok(parseTokensCss(fs.readFileSync(path.join(library, 'nomos-theme', 'tokens.css'), 'utf8'), 'nomos-theme')['--color-bg'], 'tokens re-keyed to the new name');
    assert.throws(() => runExport(['nomos-draft'], { 'project-root': source, source, as: 'Nomos Theme' }, () => {}), /already exists/);

    // a different site: its own variable names, a theme-map linking them, then apply the exported theme by name
    const site = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-site-'));
    fs.mkdirSync(path.join(site, 'src/styles/themes'), { recursive: true });
    fs.writeFileSync(path.join(site, 'src/styles/themes/theme-map.json'), JSON.stringify({ schemaVersion: 1, map: { '--color-bg': ['--bg'], '--color-text': ['--ink'] } }));
    const out = [];
    runApply(['nomos-theme', 'paper'], { 'project-root': site, pair: 'paper,nomos-theme' }, (text) => out.push(text));
    const compat = fs.readFileSync(path.join(site, 'src/styles/themes/compat.css'), 'utf8');
    assert.match(compat, /--bg: var\(--color-bg\);/);
    assert.match(fs.readFileSync(path.join(site, 'src/styles/themes/index.css'), 'utf8'), /@import '\.\/compat\.css';/);
    assert.match(out.join(''), /compat map: 2 roles/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(site, 'src/data/themes.json'), 'utf8')).pair, { light: 'paper', dark: 'nomos-theme' });
    assert.deepEqual(loadProjectMap(site).map, { '--color-bg': ['--bg'], '--color-text': ['--ink'] });
    // apply --map copies a map in
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-site2-'));
    fs.writeFileSync(path.join(other, 'm.json'), JSON.stringify({ '--color-bg': '--paper' }));
    runApply(['ink'], { 'project-root': other, map: path.join(other, 'm.json') }, () => {});
    assert.match(fs.readFileSync(path.join(other, 'src/styles/themes/compat.css'), 'utf8'), /--paper: var\(--color-bg\)/);
  } finally {
    if (previous === undefined) delete process.env.PORTABLE_TOOLKIT_THEMES; else process.env.PORTABLE_TOOLKIT_THEMES = previous;
  }
});
