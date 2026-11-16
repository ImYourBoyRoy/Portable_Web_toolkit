// ./Web_Toolkit/templates/styles/tests/styles.test.mjs
/**
 * Guards the component stylesheet set: contract-token-only, no hardcoded color or font, focus and motion safety,
 * 44px targets, accessible control edges across every shipped theme, and a clean stylesheet-check run.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const stylesDir = fileURLToPath(new URL('..', import.meta.url));
const themeDir = path.resolve(stylesDir, '../theme');
const checker = path.resolve(stylesDir, '../../stylesheet_check/bin/stylesheet-check.mjs');

const contract = JSON.parse(readFileSync(path.join(themeDir, 'tokens.contract.json'), 'utf8'));
const CONTRACT_TOKENS = new Set(
  ['color', 'font', 'radius', 'space', 'shadow', 'motion', 'layout'].flatMap((group) => contract[group].map((token) => token.name))
);

const cssFiles = readdirSync(stylesDir).filter((name) => name.endsWith('.css')).sort();
const read = (name) => readFileSync(path.join(stylesDir, name), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Bodies of leaf rules (including @font-face), split into [property, value] pairs. */
function declarations(css) {
  const result = [];
  for (const match of stripComments(css).matchAll(/\{([^{}]*)\}/g)) {
    for (const part of match[1].split(';')) {
      const colon = part.indexOf(':');
      if (colon > 0) result.push([part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim()]);
    }
  }
  return result;
}

/** Names of the enclosing at-rules (e.g. "@media (prefers-reduced-motion: reduce)") around a character index. */
function enclosingAtRules(css, index) {
  const stack = [];
  for (let position = 0; position < index; position += 1) {
    if (css[position] === '{') {
      const start = Math.max(css.lastIndexOf('}', position), css.lastIndexOf('{', position - 1), css.lastIndexOf(';', position)) + 1;
      stack.push(css.slice(start, position).trim());
    } else if (css[position] === '}') {
      stack.pop();
    }
  }
  return stack.filter((header) => header.startsWith('@'));
}

const NAMED_COLORS = ('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue '
  + 'chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki '
  + 'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise '
  + 'darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray '
  + 'green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral '
  + 'lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey '
  + 'lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen '
  + 'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive '
  + 'olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple '
  + 'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow '
  + 'springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' ');
const NAMED_COLOR_RE = new RegExp(`(?<![\\w-])(${NAMED_COLORS.join('|')})(?![\\w-])`, 'i');

test('the stylesheet set contains the expected files', () => {
  assert.deepEqual(cssFiles, ['base.css', 'button.css', 'card.css', 'form-controls.css', 'hero.css', 'index.css', 'prose.css', 'section.css', 'utilities.css']);
  for (const name of cssFiles) assert.ok(read(name).startsWith(`/* ./Web_Toolkit/templates/styles/${name}`), `${name} starts with its path comment`);
});

test('index.css imports every sheet once, base first', () => {
  const imports = [...read('index.css').matchAll(/@import "\.\/([\w-]+\.css)";/g)].map((match) => match[1]);
  assert.equal(imports[0], 'base.css');
  assert.deepEqual([...imports].sort(), cssFiles.filter((name) => name !== 'index.css'));
  assert.equal(new Set(imports).size, imports.length);
});

for (const name of cssFiles) {
  test(`${name}: comments are balanced (a stray comment terminator would silently swallow rules)`, () => {
    const css = read(name);
    assert.equal((css.match(/\/\*/g) ?? []).length, (css.match(/\*\//g) ?? []).length, 'comment openers and closers match');
    assert.doesNotMatch(stripComments(css), /\*\/|\/\*/, 'no stray comment markers outside comments');
    assert.equal(stripComments(css).split('{').length, stripComments(css).split('}').length, 'braces are balanced');
  });

  test(`${name}: every var(--token) is in the theme contract or defined in the same file`, () => {
    const css = stripComments(read(name));
    const local = new Set(declarations(css).map(([property]) => property).filter((property) => property.startsWith('--')));
    const unknown = [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]).filter((token) => !CONTRACT_TOKENS.has(token) && !local.has(token));
    assert.deepEqual([...new Set(unknown)], [], `not in tokens.contract.json: ${[...new Set(unknown)].join(', ')}`);
    assert.deepEqual([...local], [], 'component sheets must not define custom properties (tokens belong to the theme)');
  });

  test(`${name}: no hardcoded colors or font names outside comments`, () => {
    const offenders = [];
    for (const [property, value] of declarations(read(name))) {
      const scrubbed = value.replace(/var\(\s*--[\w-]+/g, 'var(');
      if (/#[0-9a-f]{3,8}\b/i.test(scrubbed)) offenders.push(`${property}: ${value} (hex)`);
      if (/(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/i.test(scrubbed)) offenders.push(`${property}: ${value} (color function)`);
      if (NAMED_COLOR_RE.test(scrubbed)) offenders.push(`${property}: ${value} (named color)`);
      if (property === 'font-family' && !/^(var\(--font-(display|sans|mono)\)|inherit)$/.test(value)) offenders.push(`${property}: ${value} (font name)`);
      if (property === 'font' && value !== 'inherit') offenders.push(`${property}: ${value} (font shorthand)`);
    }
    assert.deepEqual(offenders, []);
  });

  test(`${name}: file stays small, never removes an outline, and uses !important only in the reduced-motion guard`, () => {
    const css = stripComments(read(name));
    assert.ok(css.split('\n').filter((line) => line.trim()).length < 450, 'under the 500-line stylesheet-check limit with headroom');
    assert.doesNotMatch(css, /outline(-style)?\s*:\s*(none|0)\b/, 'outline must never be removed');
    if (name !== 'base.css') assert.doesNotMatch(css, /!important/);
    assert.doesNotMatch(css, /(^|[\s,])#[\w-]+\s*[{,]/, 'no id selectors');
  });
}

test('every interactive style has a :focus-visible rule', () => {
  const expected = {
    'base.css': [':focus-visible {'],
    'button.css': ['.btn:focus-visible'],
    'form-controls.css': ['.input:focus-visible', '.select:focus-visible', '.textarea:focus-visible', '.check input:focus-visible'],
    'card.css': ['.card__link:focus-visible', '.card--link:has(.card__link:focus-visible)'],
    'utilities.css': ['.skip-link:focus-visible', '.sr-only-focusable:focus-visible'],
    'prose.css': [':where(summary):focus-visible', ':where(pre):focus-visible', ':where(.table-scroll):focus-visible']
  };
  for (const [name, selectors] of Object.entries(expected)) {
    const css = read(name);
    for (const selector of selectors) assert.ok(css.includes(selector), `${name} is missing ${selector}`);
  }
  for (const name of cssFiles) {
    const css = stripComments(read(name));
    if (/cursor\s*:\s*pointer/.test(css)) assert.ok(/:focus-visible/.test(css), `${name} styles clickable things without a focus rule`);
  }
  assert.match(read('base.css'), /:focus-visible\s*\{\s*outline:\s*2px solid var\(--color-focus\)/);
});

test('a real prefers-reduced-motion guard exists and smooth motion is opt-in', () => {
  const base = read('base.css');
  const reduce = base.slice(base.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(reduce.startsWith('@media (prefers-reduced-motion: reduce)'), 'base.css has the reduce guard');
  for (const declaration of ['scroll-behavior: auto', 'animation-duration: 0.01ms !important', 'animation-iteration-count: 1 !important', 'transition-duration: 0.01ms !important', 'animation-delay: 0s !important']) {
    assert.ok(reduce.includes(declaration), `guard sets ${declaration}`);
  }
  for (const name of cssFiles) {
    const css = read(name);
    const stripped = stripComments(css);
    for (const match of stripped.matchAll(/scroll-behavior\s*:\s*smooth/g)) {
      const rules = enclosingAtRules(stripped, match.index);
      assert.ok(rules.some((rule) => rule.includes('prefers-reduced-motion: no-preference')), `${name}: smooth scrolling must be inside no-preference`);
    }
    for (const match of stripped.matchAll(/(^|[\s{;])animation\s*:\s*(?!none)/g)) {
      const rules = enclosingAtRules(stripped, match.index);
      assert.ok(rules.some((rule) => rule.includes('prefers-reduced-motion: no-preference')), `${name}: looping animation must be inside no-preference`);
    }
    for (const match of stripped.matchAll(/transform\s*:\s*translateY\(-\d+px\)/g)) {
      const rules = enclosingAtRules(stripped, match.index);
      assert.ok(rules.some((rule) => rule.includes('prefers-reduced-motion: no-preference')), `${name}: hover lift must be inside no-preference`);
    }
  }
});

test('touch targets keep a 44px minimum', () => {
  const rule = (name, selector) => {
    const css = stripComments(read(name));
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, `${name} has ${selector}`);
    return css.slice(start, css.indexOf('}', start));
  };
  assert.match(rule('button.css', '.btn'), /min-height: 2\.75rem/);
  assert.match(rule('button.css', '.btn'), /min-width: 2\.75rem/);
  assert.match(rule('button.css', '.btn--lg'), /min-height: 3\.5rem/);
  assert.match(rule('button.css', '.btn--icon'), /width: 2\.75rem/);
  assert.match(rule('form-controls.css', '.check'), /min-height: 2\.75rem/);
  assert.match(rule('utilities.css', '.skip-link'), /min-height: 2\.75rem/);
  assert.match(stripComments(read('form-controls.css')), /min-height: 2\.75rem;\s*padding: var\(--space-2\) var\(--space-3\)/);
  assert.doesNotMatch(rule('button.css', '.btn--sm'), /min-height/, 'small buttons only tighten padding and type');
});

function parseTheme(name) {
  const css = readFileSync(path.join(themeDir, 'themes', name, 'tokens.css'), 'utf8');
  return Object.fromEntries([...css.matchAll(/(--color-[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]]));
}
const toRgb = (hex) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
const luminance = (rgb) => {
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
};
const contrast = (left, right) => {
  const [high, low] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
};
const mix = (from, to, share) => from.map((channel, index) => (channel * share) + (to[index] * (1 - share)));

test('control and button edges read --color-border-strong, which keeps 3:1 against page and surface in every theme', () => {
  for (const file of ['form-controls.css', 'button.css']) assert.match(read(file), /border(-color)?:[^;]*var\(--color-border-strong\)/, `${file} draws control edges with --color-border-strong`);
  const themes = readdirSync(path.join(themeDir, 'themes'));
  assert.ok(themes.length >= 5);
  for (const name of themes) {
    const tokens = parseTheme(name);
    for (const background of ['--color-bg', '--color-surface']) {
      const ratio = contrast(toRgb(tokens['--color-border-strong']), toRgb(tokens[background]));
      assert.ok(ratio >= 3, `${name}: control edge on ${background} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('accent hover mix never lowers primary button contrast below AA in any theme', () => {
  const themes = readdirSync(path.join(themeDir, 'themes'));
  for (const name of themes) {
    const tokens = parseTheme(name);
    const hover = mix(toRgb(tokens['--color-accent']), toRgb(tokens['--color-text']), 0.88);
    const ratio = contrast(toRgb(tokens['--color-accent-contrast']), hover);
    assert.ok(ratio >= 4.5, `${name}: hovered primary button is ${ratio.toFixed(2)}:1`);
  }
  assert.match(read('button.css'), /color-mix\(in srgb, var\(--color-accent\) 88%, var\(--color-text\)\)/);
});

test('stylesheet-check passes on the template directory', () => {
  const result = spawnSync(process.execPath, [checker, 'scan', '--root', stylesDir], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Findings: 0/);
});

test('stylesheet-check passes on the documented adoption layout (src/styles with tokens, global, components/)', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'styles-adopt-'));
  try {
    const styles = path.join(root, 'src/styles');
    mkdirSync(path.join(root, 'src/layouts'), { recursive: true });
    mkdirSync(styles, { recursive: true });
    cpSync(path.join(themeDir, 'themes/paper/tokens.css'), path.join(styles, 'tokens.css'));
    cpSync(stylesDir, path.join(styles, 'components'), { recursive: true, filter: (source) => !source.includes(`${path.sep}tests`) && !source.endsWith('.md') });
    writeFileSync(path.join(styles, 'global.css'), '@import "./tokens.css";\n@import "./components/index.css";\n');
    writeFileSync(path.join(root, 'src/layouts/Layout.astro'), '---\nimport "../styles/global.css";\n---\n<html><body><slot /></body></html>\n');
    const result = spawnSync(process.execPath, [checker, 'scan', '--root', root], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('READMEs stay within their line budgets', () => {
  const lines = (file) => readFileSync(file, 'utf8').trimEnd().split('\n').length;
  assert.ok(lines(path.join(stylesDir, 'README.md')) < 120, 'styles README under 120 lines');
  assert.ok(lines(path.resolve(stylesDir, '../fonts/README.md')) < 100, 'fonts README under 100 lines');
});
