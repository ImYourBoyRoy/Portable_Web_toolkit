import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.resolve(here, '../bin/instagram-clone.mjs');

function run(args = []) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    cwd: path.resolve(here, '../../..')
  });
}

describe('instagram-clone CLI', () => {
  it('shows agent-oriented help successfully with no arguments', () => {
    const result = run();
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Examples:/);
    assert.match(result.stdout, /Exit codes:/);
    assert.match(result.stdout, /--json/);
  });

  it('returns structured errors for missing option values', () => {
    const result = run(['clone', '--username', '--json']);
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 1);
    assert.equal(report.ok, false);
    assert.match(report.error.message, /--username requires a value/);
  });

  it('emits a single JSON audit result', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'instagram-audit-'));
    const feedPath = path.join(projectRoot, 'src', 'data', 'instagram', 'feed.json');
    fs.mkdirSync(path.dirname(feedPath), { recursive: true });
    fs.writeFileSync(feedPath, JSON.stringify({
      username: 'example',
      profile: { profileImageUrl: 'https://example.com/profile.jpg' },
      items: [{ slides: [{ imageUrl: 'https://example.com/post.jpg' }] }]
    }));

    const result = run(['audit', '--project-root', projectRoot, '--json']);
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 0);
    assert.equal(report.ok, true);
    assert.equal(report.posts, 1);
    assert.equal(report.slides, 1);
  });
});
