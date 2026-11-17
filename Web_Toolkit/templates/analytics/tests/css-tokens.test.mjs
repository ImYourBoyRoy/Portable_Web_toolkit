// ./Web_Toolkit/templates/analytics/tests/css-tokens.test.mjs
// Conformance: template CSS may only read tokens from the theme contract and may not contain color literals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const templates = resolve(here, '..', '..');
const contract = JSON.parse(readFileSync(join(templates, 'theme', 'tokens.contract.json'), 'utf8'));

const allowed = new Set(
  ['color', 'font', 'radius', 'space', 'shadow', 'motion', 'layout'].flatMap((group) => (contract[group] ?? []).map((entry) => entry.name))
);

function cssFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (name.endsWith('.css')) out.push(full);
  }
  return out;
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '));

const files = [...cssFiles(join(templates, 'analytics')), ...cssFiles(join(templates, 'contact'))];

test('the contract exposes a usable token vocabulary', () => {
  assert.ok(allowed.size >= 30, `expected the flattened contract to hold many tokens, got ${allowed.size}`);
  assert.ok(allowed.has('--color-focus') && allowed.has('--space-4') && allowed.has('--dur-fast'));
});

test('analytics and contact each ship at least one stylesheet', () => {
  const posix = files.map((f) => f.split(/[\\/]/).join('/'));
  assert.ok(posix.some((f) => f.includes('/analytics/')), 'analytics css missing');
  assert.ok(posix.some((f) => f.includes('/contact/')), 'contact css missing');
});

for (const file of files) {
  const label = relative(templates, file);
  const css = stripComments(readFileSync(file, 'utf8'));

  test(`${label}: only contract tokens are read via var()`, () => {
    const unknown = new Set();
    for (const match of css.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
      if (!allowed.has(match[1])) unknown.add(match[1]);
    }
    assert.deepEqual([...unknown], [], `tokens not in tokens.contract.json: ${[...unknown].join(', ')}`);
  });

  test(`${label}: declares no custom properties of its own`, () => {
    const declared = [...css.matchAll(/(^|[;{\s])(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[2]);
    assert.deepEqual(declared, []);
  });

  test(`${label}: no hex or functional color literals outside comments`, () => {
    const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    const fn = css.match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi) ?? [];
    assert.deepEqual([...hex, ...fn], []);
  });
}
