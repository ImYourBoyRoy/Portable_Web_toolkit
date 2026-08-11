import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scanRoot } from '../Web_Toolkit/privacy_check/src/lib/scanner.mjs';

test('privacy scan ignores reserved example email domains', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-privacy-example-'));
  try {
    fs.writeFileSync(
      path.join(temporary, '.env.example'),
      [
        'CONTACT=security@example.com',
        'ALT=security@example.net',
        'DOCS=security@your-domain.example',
      ].join('\n'),
    );
    assert.deepEqual(scanRoot(temporary), []);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('privacy scan still reports non-reserved email addresses', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-privacy-real-'));
  try {
    const address = ['person', 'real-domain.dev'].join('@');
    fs.writeFileSync(path.join(temporary, 'notes.md'), `Contact ${address}\n`);
    const findings = scanRoot(temporary);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].label, 'Email address');
    assert.ok(!findings[0].excerpt.includes(address));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('privacy scan detects Cloudflare tokens without cf prefix', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-privacy-cf-'));
  try {
    fs.writeFileSync(path.join(temporary, '.env'), 'CLOUDFLARE_API_TOKEN=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789\n');
    const findings = scanRoot(temporary);
    assert.ok(findings.some((entry) => entry.label === 'Cloudflare token'));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('privacy scan detects Porkbun keys', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-privacy-porkbun-'));
  try {
    fs.writeFileSync(
      path.join(temporary, '.env.example'),
      'PORKBUN_API_KEY=pk1_abcdefghijklmnopqrst\nPORKBUN_SECRET_KEY=sk1_abcdefghijklmnopqrst\n',
    );
    const findings = scanRoot(temporary);
    assert.ok(findings.some((entry) => entry.label === 'Porkbun API key'));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('privacy scan detects GA and Turnstile patterns', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-privacy-ga-'));
  try {
    fs.writeFileSync(
      path.join(temporary, '.env'),
      [
        'PUBLIC_GA_MEASUREMENT_ID=G-ABCDEFGHIJ',
        'TURNSTILE_SECRET_KEY=0x4AAAAAAAabcdefghijklmnopqrstuvwxyz',
        'PUBLIC_TURNSTILE_SITE_KEY=0x4BBBBBBBabcdefghijklmnopqrstuvwxyz',
      ].join('\n'),
    );
    const findings = scanRoot(temporary);
    assert.ok(findings.some((entry) => entry.label === 'Google Analytics ID'));
    assert.ok(findings.some((entry) => entry.label === 'Turnstile secret'));
    assert.ok(findings.some((entry) => entry.label === 'Turnstile site key'));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
