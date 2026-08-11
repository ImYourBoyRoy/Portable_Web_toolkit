// ./Web_Toolkit/discovery_doctor/tests/cli.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bin = path.resolve(__dirname, '../bin/discovery-doctor.mjs');

function runDoctor(target) {
  return spawnSync(process.execPath, [bin, target], {
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '../../..')
  });
}

describe('discovery-doctor CLI', () => {
  it('exits 2 on empty dist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-empty-'));
    const result = runDoctor(dir);
    assert.equal(result.status, 2, result.stderr || result.stdout);
  });

  it('accepts sitemap-index and warns (not fails) without breadcrumb', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-ok-'));
    fs.writeFileSync(
      path.join(dir, 'sitemap-index.xml'),
      '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>'
    );
    fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap-index.xml\n');
    fs.writeFileSync(path.join(dir, 'llms.txt'), '# site');
    fs.writeFileSync(path.join(dir, 'llms-full.txt'), '# full');
    fs.writeFileSync(path.join(dir, 'humans.txt'), '/* team */');
    fs.mkdirSync(path.join(dir, '.well-known'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.well-known', 'security.txt'), 'Contact: mailto:sec@example.com\n');
    fs.mkdirSync(path.join(dir, 'api'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'api', 'content.json'), '{"pages":[]}');
    fs.writeFileSync(
      path.join(dir, '_headers'),
      [
        '/*',
        '  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
        '  X-Content-Type-Options: nosniff',
        '  X-Frame-Options: DENY',
        '  Referrer-Policy: strict-origin-when-cross-origin',
        '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
        '  Content-Security-Policy: default-src \'self\''
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(dir, 'index.html'),
      '<html><head><script type="application/ld+json">{"@type":"WebSite","name":"Demo"}</script></head><body></body></html>'
    );

    const result = runDoctor(dir);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout + result.stderr, /Breadcrumb Schema/i);
    assert.match(result.stdout + result.stderr, /\[WARN\]/i);
  });
});
