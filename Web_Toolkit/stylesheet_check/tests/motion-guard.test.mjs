// ./Web_Toolkit/stylesheet_check/tests/motion-guard.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { scanStylesheets } from '../src/lib/scanner.mjs';

function scan(css) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'styles-motion-'));
  fs.mkdirSync(path.join(dir, 'src', 'styles'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'styles', 'motion.css'), css);
  return scanStylesheets(dir).findings.filter((finding) => finding.category === 'motion-reduced-guard');
}

describe('Motion reduced-motion guard', () => {
  it('flags scroll-driven animation and @view-transition without a reduced-motion guard', () => {
    const findings = scan('.a { animation: x linear both; animation-timeline: view(); }\n@view-transition { navigation: auto; }\n');
    assert.equal(findings.length, 2);
    assert.ok(findings.every((finding) => finding.severity === 'error'));
  });

  it('passes when the file gates the effects with prefers-reduced-motion', () => {
    const findings = scan('@media (prefers-reduced-motion: no-preference) {\n  @view-transition { navigation: auto; }\n  .a { animation-timeline: view(); }\n}\n');
    assert.equal(findings.length, 0);
  });
});
