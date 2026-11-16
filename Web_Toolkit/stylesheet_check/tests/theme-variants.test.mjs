// ./Web_Toolkit/stylesheet_check/tests/theme-variants.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { scanStylesheets } from '../src/lib/scanner.mjs';

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'styles-themes-'));
  for (const [file, css] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), css);
  }
  return scanStylesheets(dir).findings.filter((finding) => finding.category === 'duplicate-token');
}

describe('Theme variant token files', () => {
  it('may redefine the same tokens as the default and each other', () => {
    const findings = project({
      'src/styles/tokens.css': ':root { --color-bg: #fff; --space-1: 0.25rem; }\n',
      'src/styles/themes/ink/tokens.css': ':root[data-theme="ink"] { --color-bg: #000; --space-1: 0.25rem; }\n',
      'src/styles/themes/paper/tokens.css': ':root[data-theme="paper"] { --color-bg: #fbfaf7; --space-1: 0.25rem; }\n'
    });
    assert.equal(findings.length, 0);
  });

  it('still flags a token defined twice outside the themes folder', () => {
    const findings = project({
      'src/styles/tokens.css': ':root { --color-bg: #fff; }\n',
      'src/styles/tokens/extra.css': ':root { --color-bg: #eee; }\n'
    });
    assert.equal(findings.length, 1);
  });
});
