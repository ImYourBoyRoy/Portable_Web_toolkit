import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectTools, findTools, renderToolsMd } from '../Web_Toolkit/toolkit_index/src/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = collectTools(path.join(ROOT, 'Web_Toolkit'));

test('every packaged CLI appears in the index with a summary, usage, and an example', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'Web_Toolkit', 'package.json'), 'utf8'));
  assert.deepEqual(tools.map((tool) => tool.name).sort(), Object.keys(pkg.bin).sort());
  for (const tool of tools) {
    assert.ok(tool.summary.length > 10, `${tool.name} needs a summary`);
    assert.ok(tool.usage.length > 0, `${tool.name} needs usage lines`);
  }
});

test('docs/TOOLS.md is current and small enough to read first', () => {
  const rendered = renderToolsMd(tools);
  const onDisk = fs.readFileSync(path.join(ROOT, 'docs', 'TOOLS.md'), 'utf8');
  assert.equal(onDisk, rendered, 'stale: run node Web_Toolkit/toolkit_index/bin/toolkit-index.mjs build');
  assert.ok(rendered.length / 4 < 3500, `index is ${Math.round(rendered.length / 4)} tokens; keep it under 3500`);
});

test('every intent and category names a real tool, and find routes common tasks', () => {
  const intents = JSON.parse(fs.readFileSync(path.join(ROOT, 'Web_Toolkit', 'toolkit_index', 'src', 'intents.json'), 'utf8'));
  const names = new Set(tools.map((tool) => tool.name));
  for (const intent of intents.intents) assert.ok(names.has(intent.use), `intent "${intent.task}" names unknown tool ${intent.use}`);
  for (const [category, list] of Object.entries(intents.categories)) for (const name of list) assert.ok(names.has(name), `${category}: unknown tool ${name}`);
  const top = (query) => findTools(query, tools, 1)[0]?.name;
  assert.equal(top('compare five themes on this site'), 'site-theme');
  assert.equal(top('my typescript upgrade is held back'), 'package-updater');
  assert.equal(top('check keyboard focus and contrast for wcag'), 'wcag-auditor');
  assert.equal(top('broken links and meta descriptions'), 'preview-check');
  assert.equal(top('purge the cloudflare cache'), 'cf-agent');
});
