// ./Web_Toolkit/wcag_auditor/tests/bridge.test.mjs
/**
 * Wrapper tests: engine resolves from Web_Toolkit/node_modules, never AI/.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ensureEngine, resolveCoreRoot } from '../src/toolkit/resolve-core.mjs';
import { buildAstroConfigObject } from '../src/toolkit/profile-config.mjs';

const WRAPPER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(WRAPPER_ROOT, 'bin', 'wcag-auditor.mjs');

function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: WRAPPER_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('ensureEngine resolves @imyourboyroy/wcagate under Web_Toolkit/node_modules', () => {
  const root = ensureEngine({ skip: true });
  assert.match(root.replace(/\\/g, '/'), /Web_Toolkit\/node_modules\/@imyourboyroy\/wcagate$/);
  assert.ok(!root.includes(`${path.sep}AI${path.sep}wcag-auditor`));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@imyourboyroy/wcagate');
  assert.ok(fs.existsSync(path.join(root, 'bin', 'wcagate.mjs')));
});

test('core-path CLI prints the engine package root', async () => {
  const result = await runCli(['core-path', '--skip-engine-install']);
  assert.equal(result.code, 0, result.stderr);
  const printed = result.stdout.trim().replace(/\\/g, '/');
  assert.match(printed, /node_modules\/@imyourboyroy\/wcagate$/);
  assert.equal(printed, resolveCoreRoot({ skip: true }).replace(/\\/g, '/'));
});

test('help mentions GitHub WCAGate and forbids AI/ resolution', async () => {
  const result = await runCli(['help']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /imyourboyroy\/WCAGate/);
  assert.match(result.stdout, /Never resolve AI\/wcag-auditor/);
  assert.doesNotMatch(result.stdout, /WCAG_AUDITOR_ROOT/);
});

test('WCAGATE_ROOT pointing at AI/wcag-auditor is refused', () => {
  const fake = path.join(os.tmpdir(), 'AI', 'wcag-auditor');
  const previous = process.env.WCAGATE_ROOT;
  process.env.WCAGATE_ROOT = fake;
  try {
    assert.throws(() => resolveCoreRoot({ skip: true }), /refused a workstation AI\/ checkout/i);
  } finally {
    if (previous === undefined) delete process.env.WCAGATE_ROOT;
    else process.env.WCAGATE_ROOT = previous;
  }
});

test('invalid WCAGATE_ROOT fails closed (exit 2), never a silent pass', async () => {
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'wcagate-missing-'));
  const result = await runCli(['core-path', '--skip-engine-install'], {
    WCAGATE_ROOT: fake,
    WCAGATE_SKIP_INSTALL: '1'
  });
  assert.equal(result.code, 2, result.stderr);
  assert.match(`${result.stderr}\n${result.stdout}`, /missing|not a valid/i);
});

test('profile-built config includes playwright-axe and results reporter', () => {
  const config = buildAstroConfigObject({
    profile: { siteId: 'example', hosts: { development: ['http://127.0.0.1:4321'] } },
    projectRoot: WRAPPER_ROOT,
    outputDirectory: '.wcag-audit-results'
  });
  assert.ok(config.adapters.some((adapter) => adapter.type === 'playwright-axe'));
  assert.ok(config.reporters.some((reporter) => reporter.type === 'results'));
  assert.ok(!config.reporters.some((reporter) => reporter.type === 'dashboard'));
});
