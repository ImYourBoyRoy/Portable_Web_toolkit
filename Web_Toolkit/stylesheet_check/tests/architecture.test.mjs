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

describe('Scan scope safety', () => {
  it('throws for a root that does not exist instead of reporting a clean scan', () => {
    assert.throws(() => scanStylesheets(path.join(os.tmpdir(), 'styles-does-not-exist-xyz')), /does not exist/);
  });

  it('warns when nothing was scanned', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'styles-empty-'));
    const report = scanStylesheets(dir);
    assert.ok(report.findings.some((f) => f.category === 'scope' && /No component or stylesheet/i.test(f.label)));
    assert.ok(report.summary.warnings >= 1);
  });

  it('does not follow symlinks into other trees', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'styles-link-'));
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'styles-linked-'));
    fs.writeFileSync(path.join(other, 'tool.css'), 'body { color: red; }\n');
    fs.symlinkSync(other, path.join(dir, 'Web_Toolkit'));
    const report = scanStylesheets(dir);
    assert.equal(report.scanned.stylesheetFiles, 0);
  });
});

describe('tokens folder layout and --exclude', () => {
  const make = (prefix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    fs.mkdirSync(path.join(dir, 'src', 'styles', 'tokens'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'styles', 'tokens', 'theme.css'), ':root { --x: 1; }\n');
    return dir;
  };

  it('accepts src/styles/tokens/*.css as the token source', () => {
    const dir = make('styles-tokdir-');
    fs.writeFileSync(path.join(dir, 'src', 'styles', 'global.css'), '@import "./tokens/theme.css";\nbody { margin: 0; }\n');
    const report = scanStylesheets(dir);
    assert.equal(report.findings.filter((f) => f.category === 'architecture' && /tokens/i.test(f.label)).length, 0);
  });

  it('accepts tokens imported by another top-level sheet (critical.css)', () => {
    const dir = make('styles-tokcrit-');
    fs.writeFileSync(path.join(dir, 'src', 'styles', 'global.css'), 'body { margin: 0; }\n');
    fs.writeFileSync(path.join(dir, 'src', 'styles', 'critical.css'), '@import "./tokens/theme.css";\n');
    const report = scanStylesheets(dir);
    assert.ok(!report.findings.some((f) => /does not import tokens/i.test(f.label)));
  });

  it('still warns when a tokens folder exists but nothing imports it', () => {
    const dir = make('styles-toknone-');
    fs.writeFileSync(path.join(dir, 'src', 'styles', 'global.css'), 'body { margin: 0; }\n');
    assert.ok(scanStylesheets(dir).findings.some((f) => /does not import tokens/i.test(f.label)));
  });

  it('an empty tokens folder is not a token source', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'styles-tokempty-'));
    fs.mkdirSync(path.join(dir, 'src', 'styles', 'tokens'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'styles', 'global.css'), 'body { margin: 0; }\n');
    assert.ok(scanStylesheets(dir).findings.some((f) => /Missing tokens\.css/.test(f.label)));
  });

  it('--exclude skips archive folders and reports them', () => {
    const dir = make('styles-excl-');
    fs.writeFileSync(path.join(dir, 'src', 'styles', 'global.css'), '@import "./tokens/theme.css";\n');
    fs.mkdirSync(path.join(dir, 'archive'));
    fs.writeFileSync(path.join(dir, 'archive', 'old.css'), ':root { --stray: 1; }\n');
    assert.ok(scanStylesheets(dir).findings.some((f) => f.file.startsWith('archive/')));
    const report = scanStylesheets(dir, { exclude: './archive/, nope' });
    assert.ok(!report.findings.some((f) => f.file.startsWith('archive/')));
    assert.deepEqual(report.excluded, ['archive', 'nope']);
  });

  it('exclude matches path segments, not string prefixes', () => {
    const dir = make('styles-excl2-');
    fs.writeFileSync(path.join(dir, 'src', 'styles', 'global.css'), '@import "./tokens/theme.css";\n');
    fs.mkdirSync(path.join(dir, 'archive-keep'));
    fs.writeFileSync(path.join(dir, 'archive-keep', 'x.css'), ':root { --stray: 1; }\n');
    assert.ok(scanStylesheets(dir, { exclude: 'archive' }).findings.some((f) => f.file.startsWith('archive-keep/')));
  });
});
