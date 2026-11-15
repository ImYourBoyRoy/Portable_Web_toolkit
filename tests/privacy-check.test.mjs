import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scanRoot } from '../Web_Toolkit/privacy_check/src/lib/scanner.mjs';

/** Build fixture text at runtime so release privacy scans do not flag this file. */
function envAssignment(key, value) {
  return [key, '=', value].join('');
}

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
    const token = ['AbCdEfGhIjKlMnOpQrStUvWxYz', '0123456789'].join('');
    fs.writeFileSync(
      path.join(temporary, '.env'),
      `${envAssignment('CLOUDFLARE_API_TOKEN', token)}\n`,
    );
    const findings = scanRoot(temporary);
    assert.ok(findings.some((entry) => entry.label === 'Cloudflare token'));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('privacy scan ignores empty Cloudflare token before next env key', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-privacy-cf-empty-'));
  try {
    fs.writeFileSync(
      path.join(temporary, '.env.example'),
      [
        envAssignment('CLOUDFLARE_API_TOKEN', ''),
        envAssignment('GOOGLE_PAGESPEED_API_KEY', ''),
        envAssignment('CLOUDFLARE_ACCOUNT_ID', ''),
      ].join('\n'),
    );
    assert.deepEqual(scanRoot(temporary), []);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('privacy scan detects Porkbun keys', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-privacy-porkbun-'));
  try {
    const porkbunKey = ['pk1_', 'abcdefghijklmnopqrst'].join('');
    const porkbunSecret = ['sk1_', 'abcdefghijklmnopqrst'].join('');
    fs.writeFileSync(
      path.join(temporary, '.env.example'),
      [
        envAssignment('PORKBUN_API_KEY', porkbunKey),
        envAssignment('PORKBUN_SECRET_KEY', porkbunSecret),
      ].join('\n'),
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
    const gaId = ['G-', 'ABCDEFGHIJ'].join('');
    const turnstileSecret = ['0x4AAAAAAA', 'abcdefghijklmnopqrstuvwxyz'].join('');
    const turnstileSite = ['0x4BBBBBBB', 'abcdefghijklmnopqrstuvwxyz'].join('');
    fs.writeFileSync(
      path.join(temporary, '.env'),
      [
        envAssignment('PUBLIC_GA_MEASUREMENT_ID', gaId),
        envAssignment('TURNSTILE_SECRET_KEY', turnstileSecret),
        envAssignment('PUBLIC_TURNSTILE_SITE_KEY', turnstileSite),
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

/** Build a throwaway tree from { relativePath: contents } and scan it. */
function scanFixture(files) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-privacy-fixture-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
      const target = path.join(temporary, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    }
    return scanRoot(temporary);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

const FAKE_TOKEN = ['cfut', '_', 'abcdefghijklmnopqrstuvwxyz0123456789ABCD'].join('');

test('privacy scan reads secret-bearing files with unusual names', () => {
  const secretLine = `${envAssignment('CLOUDFLARE_API_TOKEN', 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')}\n`;
  for (const name of ['.dev.vars', '.env.local', '.env.production', 'deploy.sh', 'setup.ps1', 'page.astro', 'wrangler.jsonc']) {
    const findings = scanFixture({ [name]: secretLine });
    assert.ok(findings.some((entry) => entry.label === 'Cloudflare token'), `${name} should be scanned`);
  }
});

test('privacy scan detects JSON and YAML style secret assignments', () => {
  const value = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
  const json = scanFixture({ 'config.json': `{"CLOUDFLARE_API_TOKEN": "${value}"}\n` });
  assert.ok(json.some((entry) => entry.label === 'Cloudflare token'));
  const yaml = scanFixture({ 'config.yml': `CLOUDFLARE_API_TOKEN: ${value}\n` });
  assert.ok(yaml.some((entry) => entry.label === 'Cloudflare token'));
});

test('privacy scan does not flag empty or placeholder assignments', () => {
  const findings = scanFixture({
    '.env.example': 'CLOUDFLARE_API_TOKEN=\nCLOUDFLARE_API_TOKEN: "<your-token>"\nCLOUDFLARE_API_TOKEN=changeme\n',
  });
  assert.deepEqual(findings, []);
});

test('privacy scan detects prefixed Cloudflare tokens, GitHub tokens, and private key blocks', () => {
  const github = ['ghp', '_', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('');
  const pem = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  const findings = scanFixture({
    'notes.txt': `token ${FAKE_TOKEN}\n`,
    'ci.yml': `value: ${github}\n`,
    'key.txt': `${pem}\nMIIE\n`,
  });
  const labels = findings.map((entry) => entry.label);
  assert.ok(labels.includes('Cloudflare API token (prefixed)'));
  assert.ok(labels.includes('GitHub token (standalone)'));
  assert.ok(labels.includes('Private key block'));
});

test('privacy scan detects Linux home paths but not placeholders', () => {
  const real = scanFixture({ 'notes.md': `see ${['', 'home', 'someoperator', 'project'].join('/')}\n` });
  assert.ok(real.some((entry) => entry.label === 'Linux home path'));
  const placeholder = scanFixture({ 'notes.md': `see ${['', 'home', 'user', 'project'].join('/')} and ${['', 'home', 'runner', 'work'].join('/')}\n` });
  assert.deepEqual(placeholder, []);
});

test('privacy scan skips binary files, symlinks, and generated folders', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-privacy-skip-'));
  try {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-privacy-outside-'));
    fs.writeFileSync(path.join(outside, 'secret.txt'), `token ${FAKE_TOKEN}\n`);
    fs.symlinkSync(outside, path.join(temporary, 'linked'));
    fs.symlinkSync(temporary, path.join(temporary, 'loop'));
    fs.writeFileSync(path.join(temporary, 'blob.bin'), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(FAKE_TOKEN)]));
    fs.mkdirSync(path.join(temporary, 'tool', 'output'), { recursive: true });
    fs.writeFileSync(path.join(temporary, 'tool', 'output', 'report.json'), `token ${FAKE_TOKEN}\n`);
    assert.deepEqual(scanRoot(temporary), []);
    fs.rmSync(outside, { recursive: true, force: true });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
