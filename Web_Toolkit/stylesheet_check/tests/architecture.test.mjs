// ./Web_Toolkit/stylesheet_check/tests/architecture.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { scanStylesheets } from '../src/lib/scanner.mjs';

describe('Astro stylesheet architecture', () => {
  it('errors when tokens.css is missing under src/styles', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'styles-arch-'));
    fs.mkdirSync(path.join(dir, 'src', 'styles'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'styles', 'global.css'), 'body { margin: 0; }\n');
    const report = scanStylesheets(dir);
    assert.ok(report.findings.some((f) => f.category === 'architecture' && /tokens\.css/i.test(f.label)));
  });

  it('warns when global.css does not import tokens', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'styles-arch2-'));
    fs.mkdirSync(path.join(dir, 'src', 'styles'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'styles', 'tokens.css'), ':root { --x: 1; }\n');
    fs.writeFileSync(path.join(dir, 'src', 'styles', 'global.css'), 'body { margin: 0; }\n');
    const report = scanStylesheets(dir);
    assert.ok(report.findings.some((f) => /does not import tokens/i.test(f.label)));
  });
});
