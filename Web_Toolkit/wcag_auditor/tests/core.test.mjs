import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { normalizeConfig, validateConfig } from '../src/core/config.mjs';
import { createProjectImporter } from '../src/core/dependencies.mjs';
import { toJsonSafe } from '../src/core/json.mjs';
import { resolveOutputFile, validateRelativeOutputFile } from '../src/core/path-policy.mjs';
import { evaluateGate } from '../src/core/gate.mjs';
import { matchesGlob } from '../src/core/filesystem.mjs';
import { normalizeFinding } from '../src/core/result.mjs';
import { applySuppressions, validateSuppression } from '../src/core/suppressions.mjs';

const baseConfig = {
  schemaVersion: 1,
  project: { name: 'Fixture' },
  adapters: [{ type: 'native-evidence', file: 'a11y.json' }]
};

test('configuration normalizes deterministic defaults', () => {
  const config = normalizeConfig(baseConfig, { cwd: '/tmp/project' });
  assert.equal(config.project.name, 'Fixture');
  assert.equal(config.project.root, '/tmp/project');
  assert.equal(config.adapters[0].id, 'native-evidence-1');
  assert.equal(config.adapters[0].required, true);
  assert.deepEqual(config.gate.failOnSeverities, ['critical', 'serious', 'moderate', 'minor']);
  assert.equal(config.outputDirectory, '/tmp/project/.wcag-audit-results');
});

test('configuration rejects duplicate adapters and unknown types', () => {
  const errors = validateConfig({
    ...baseConfig,
    adapters: [
      { id: 'duplicate', type: 'native-evidence', file: 'one.json' },
      { id: 'duplicate', type: 'fictional' }
    ]
  });
  assert.ok(errors.some((error) => error.includes('unique')));
  assert.ok(errors.some((error) => error.includes('must be one of')));
});

test('glob matching supports recursive and single-level patterns', () => {
  assert.equal(matchesGlob('src/lib/Button.svelte', 'src/**/*.svelte'), true);
  assert.equal(matchesGlob('src/Button.svelte', 'src/**/*.svelte'), true);
  assert.equal(matchesGlob('src/lib/Button.ts', 'src/**/*.svelte'), false);
  assert.equal(matchesGlob('a/b/c.json', '**/*.json'), true);
});

test('finding fingerprints are stable and selectors are canonicalized', () => {
  const context = { runId: 'run', projectName: 'Fixture', adapterName: 'runtime' };
  const first = normalizeFinding({
    ruleId: 'test/rule',
    title: 'Test',
    outcome: 'failed',
    severity: 'serious',
    target: { selectorOrNode: ['main', 'button'] }
  }, context);
  const second = normalizeFinding({
    ruleId: 'test/rule',
    title: 'Test',
    outcome: 'failed',
    severity: 'serious',
    target: { selectorOrNode: 'main > button' }
  }, context);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.target.selectorOrNode, 'main > button');
});

test('suppression requires accountable bounded metadata', () => {
  assert.equal(validateSuppression({}), 'fingerprint or ruleId is required');
  const suppression = {
    ruleId: 'test/rule',
    justification: 'Known third-party defect',
    owner: 'owner@example.test',
    ticket: 'A11Y-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-02-01T00:00:00.000Z'
  };
  assert.equal(validateSuppression(suppression), null);
  const finding = {
    ruleId: 'test/rule',
    outcome: 'failed',
    target: { adapter: 'adapter' },
    fingerprint: 'abc',
    suppressed: false
  };
  const applied = applySuppressions([finding], [suppression], new Date('2026-01-15T00:00:00.000Z'));
  assert.equal(applied.findings[0].suppressed, true);
  const expired = applySuppressions([finding], [suppression], new Date('2026-03-01T00:00:00.000Z'));
  assert.equal(expired.findings[0].suppressed, false);
  assert.equal(expired.expired.length, 1);
});

test('suppression can resolve axe cantTell for frost/glass contrast', () => {
  assert.match(
    validateSuppression({
      ruleId: 'axe/color-contrast',
      outcomes: ['untested'],
      justification: 'x',
      owner: 'o',
      ticket: 't',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-02-01T00:00:00.000Z'
    }),
    /outcomes/
  );
  const suppression = {
    ruleId: 'axe/color-contrast',
    outcomes: ['cantTell'],
    adapter: 'playwright-axe',
    routeOrScene: 'home',
    justification: 'Manual AA on frosted panels',
    owner: 'owner@example.test',
    ticket: 'A11Y-FROST-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-06-01T00:00:00.000Z'
  };
  assert.equal(validateSuppression(suppression), null);
  const cantTell = {
    ruleId: 'axe/color-contrast',
    outcome: 'cantTell',
    target: { adapter: 'playwright-axe', routeOrScene: 'home' },
    fingerprint: 'frost',
    suppressed: false
  };
  const failed = {
    ruleId: 'axe/color-contrast',
    outcome: 'failed',
    target: { adapter: 'playwright-axe', routeOrScene: 'home' },
    fingerprint: 'hard-fail',
    suppressed: false
  };
  const applied = applySuppressions([cantTell, failed], [suppression], new Date('2026-03-01T00:00:00.000Z'));
  assert.equal(applied.findings[0].suppressed, true);
  assert.equal(applied.findings[1].suppressed, false);
  const defaultFailedOnly = applySuppressions(
    [cantTell],
    [{ ...suppression, outcomes: undefined }],
    new Date('2026-03-01T00:00:00.000Z')
  );
  assert.equal(defaultFailedOnly.findings[0].suppressed, false);
});

test('gate exit-code precedence is execution, no surface, unresolved, blocking, pass', () => {
  const gate = normalizeConfig(baseConfig, { cwd: '/tmp' }).gate;
  const baseRun = { surfaceCount: 1, findings: [] };
  assert.equal(evaluateGate({ ...baseRun, findings: [{ outcome: 'executionError', severity: 'serious', suppressed: false, fingerprint: 'e' }] }, gate).exitCode, 2);
  assert.equal(evaluateGate({ ...baseRun, surfaceCount: 0 }, gate).exitCode, 2);
  assert.equal(evaluateGate({ ...baseRun, findings: [{ outcome: 'untested', severity: 'serious', suppressed: false, fingerprint: 'u' }] }, gate).exitCode, 3);
  assert.equal(evaluateGate({ ...baseRun, findings: [{ outcome: 'cantTell', severity: 'serious', suppressed: true, fingerprint: 'c' }] }, gate).exitCode, 0);
  assert.equal(evaluateGate({ ...baseRun, findings: [{ outcome: 'failed', severity: 'serious', suppressed: false, fingerprint: 'f' }] }, gate).exitCode, 1);
  assert.equal(evaluateGate(baseRun, gate).exitCode, 0);
});


test('configuration rejects unsafe reports, malformed adapter settings, and non-JSON metadata', () => {
  const circular = {};
  circular.self = circular;
  const errors = validateConfig({
    ...baseConfig,
    metadata: circular,
    adapters: [{ id: '', type: 'command-evidence', command: 'tool', env: { BAD: 42 }, timeoutMs: 0 }],
    reporters: [
      { type: 'json', file: '../escape.json' },
      { type: 'sarif', file: '../escape.json' },
      { type: 'console', file: 'invalid.txt' }
    ]
  });
  assert.ok(errors.some((error) => error.includes('circular reference')));
  assert.ok(errors.some((error) => error.includes('.id must be a non-empty string')));
  assert.ok(errors.some((error) => error.includes('.env must be an object')));
  assert.ok(errors.some((error) => error.includes('.timeoutMs must be a positive integer')));
  assert.ok(errors.some((error) => error.includes('stay inside')));
  assert.ok(errors.some((error) => error.includes('not valid for console')));
});

test('output file policy contains reporters inside the output directory', () => {
  assert.equal(validateRelativeOutputFile('nested/run.json'), null);
  assert.match(validateRelativeOutputFile('../run.json'), /stay inside/);
  assert.match(validateRelativeOutputFile('C:\\temp\\run.json'), /relative path/);
  assert.equal(resolveOutputFile('/tmp/output', 'nested/run.json'), '/tmp/output/nested/run.json');
  assert.throws(() => resolveOutputFile('/tmp/output', '../../escape.json'), /stay inside/);
});

test('JSON normalization preserves JSON data and rejects report-breaking values', () => {
  assert.deepEqual(toJsonSafe({ at: new Date('2026-07-30T00:00:00.000Z'), missing: undefined }), {
    at: '2026-07-30T00:00:00.000Z'
  });
  assert.throws(() => toJsonSafe({ value: BigInt(1) }), /bigint/);
  const circular = {};
  circular.self = circular;
  assert.throws(() => toJsonSafe(circular), /circular reference/);
});

test('suppression expires at its exact boundary and rejects future creation', () => {
  const suppression = {
    ruleId: 'test/rule',
    justification: 'Temporary exception',
    owner: 'owner@example.test',
    ticket: 'A11Y-2',
    createdAt: '2026-07-01T00:00:00.000Z',
    expiresAt: '2026-07-30T12:00:00.000Z'
  };
  assert.equal(validateSuppression(suppression, new Date('2026-06-30T00:00:00.000Z')), 'createdAt must not be in the future');
  const finding = { ruleId: 'test/rule', outcome: 'failed', target: { adapter: 'adapter' }, fingerprint: 'abc', suppressed: false };
  const result = applySuppressions([finding], [suppression], new Date('2026-07-30T12:00:00.000Z'));
  assert.equal(result.expired.length, 1);
  assert.equal(result.findings[0].suppressed, false);
});


test('project importer resolves optional dependencies from the audited project root', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-auditor-importer-'));
  const packageDirectory = path.join(root, 'node_modules', 'fixture-dependency');
  await fs.mkdir(packageDirectory, { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}\n');
  await fs.writeFile(path.join(packageDirectory, 'package.json'), JSON.stringify({
    name: 'fixture-dependency',
    version: '1.0.0',
    type: 'module',
    exports: './index.js'
  }));
  await fs.writeFile(path.join(packageDirectory, 'index.js'), 'export const source = "audited-project";\n');
  const imported = await createProjectImporter(root)('fixture-dependency');
  assert.equal(imported.source, 'audited-project');
});
