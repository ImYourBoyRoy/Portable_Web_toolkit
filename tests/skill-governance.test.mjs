import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statusScript = path.join(repoRoot, 'scripts', 'check-agent-skills.mjs');
const sourceSkill = path.join(repoRoot, 'skills', 'portable-web-toolkit');

function status(project, ...extra) {
  const result = spawnSync(
    process.execPath,
    [
      statusScript,
      '--agent',
      'cursor',
      '--scope',
      'project',
      '--project',
      project,
      '--skill',
      'portable-web-toolkit',
      ...extra,
    ],
    { encoding: 'utf8' },
  );
  return result;
}

test('status helper classifies trees without mutating them', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-skill-status-'));
  try {
    const before = fs.readdirSync(temporary);
    let result = status(temporary);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).results[0].status, 'missing');
    assert.deepEqual(fs.readdirSync(temporary), before);

    const target = path.join(
      temporary,
      '.cursor',
      'skills',
      'portable-web-toolkit',
    );
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(sourceSkill, target, { recursive: true });

    result = status(temporary);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).results[0].status, 'current');

    const alternative = path.join(
      temporary,
      '.agents',
      'skills',
      'portable-web-toolkit',
    );
    fs.mkdirSync(path.dirname(alternative), { recursive: true });
    fs.cpSync(sourceSkill, alternative, { recursive: true });
    result = status(temporary);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).duplicate_discovery.length, 1);
    fs.rmSync(alternative, { recursive: true });

    fs.appendFileSync(path.join(target, 'SKILL.md'), '\nLocal change.\n');
    result = status(temporary);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).results[0].status, 'different');

    fs.rmSync(target, { recursive: true });
    fs.symlinkSync(sourceSkill, target, 'dir');
    result = status(temporary);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).results[0].status, 'unsafe-symlink');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('status helper rejects apply mode', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pwt-skill-apply-'));
  try {
    const result = status(temporary, '--apply');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /read-only/i);
    assert.deepEqual(fs.readdirSync(temporary), []);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
