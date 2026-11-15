// ./Web_Toolkit/site_snapshots/tests/snapshots.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DEFAULTS, extractItems, loadConfig } from '../src/lib/config.mjs';
import { distance } from '../src/lib/diff.mjs';

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshots-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

describe('site-snapshots config', () => {
  it('extracts id, url and options from a nested list and skips unusable entries', () => {
    const dir = project({
      'site-snapshots.config.json': { source: 'data.json', itemsPath: 'projects', optionsField: 'preview' },
      'data.json': { projects: [
        { id: 'a', url: 'https://a.example', preview: { hideSelectors: ['.x'] } },
        { id: 'b', url: 'not-a-url' },
        { id: 'c', url: 'https://c.example', preview: { skip: true } },
        { url: 'https://d.example' },
      ] },
    });
    const { config } = loadConfig(dir);
    const items = extractItems(dir, config);
    assert.deepEqual(items.map((item) => item.id), ['a']);
    assert.deepEqual(items[0].options.hideSelectors, ['.x']);
    assert.equal(config.outputDir, DEFAULTS.outputDir);
  });

  it('fails clearly when the config or source is missing', () => {
    const dir = project({});
    assert.throws(() => loadConfig(dir), /No config/);
    const dir2 = project({ 'site-snapshots.config.json': {} });
    assert.throws(() => loadConfig(dir2), /needs "source"/);
  });
});

describe('snapshot distance', () => {
  it('is 0 for identical signatures, 1 for incompatible ones and grows with difference', () => {
    const flat = Buffer.alloc(640, 10);
    const bright = Buffer.alloc(640, 138);
    assert.equal(distance(flat, flat), 0);
    assert.ok(Math.abs(distance(flat, bright) - 128 / 255) < 1e-9);
    assert.equal(distance(flat, Buffer.alloc(10)), 1);
  });
});
