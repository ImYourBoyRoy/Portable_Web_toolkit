import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runAccessibility } from '../src/core/runner.mjs';
import { renderConsoleReport, writeConsoleReport } from '../src/reporters/console.mjs';
import { renderHtmlReport } from '../src/reporters/html.mjs';
import { renderJunitReport } from '../src/reporters/junit.mjs';
import { renderSarifReport } from '../src/reporters/sarif.mjs';

async function fixture(outcome, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-auditor-runner-'));
  const findings = outcome ? [{
    ruleId: 'fixture/rule',
    title: 'Fixture finding',
    outcome,
    severity: options.severity ?? 'serious',
    target: { routeOrScene: 'home', selectorOrNode: '#target' },
    evidence: { message: '<unsafe>' }
  }] : [];
  await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify({
    schemaVersion: 1,
    producer: { name: 'fixture', version: '1.0.0', kind: 'test' },
    surfaceCount: options.surfaceCount ?? 1,
    findings
  }));
  const config = {
    schemaVersion: 1,
    project: { name: 'Fixture', root },
    adapters: [{ type: 'native-evidence', file: 'evidence.json' }],
    reporters: [
      { type: 'json', file: 'run.json' },
      { type: 'sarif', file: 'run.sarif' },
      { type: 'junit', file: 'run.xml' },
      { type: 'html', file: 'run.html' },
      { type: 'markdown', file: 'run.md' }
    ]
  };
  return { root, config };
}

test('runner returns pass, blocking, and unresolved exit codes', async () => {
  const passing = await fixture(null);
  assert.equal((await runAccessibility(passing.config, { quiet: true })).gate.exitCode, 0);
  const failing = await fixture('failed');
  assert.equal((await runAccessibility(failing.config, { quiet: true })).gate.exitCode, 1);
  const unresolved = await fixture('untested');
  assert.equal((await runAccessibility(unresolved.config, { quiet: true })).gate.exitCode, 3);
});

test('runner rejects an empty test surface instead of returning a false pass', async () => {
  const empty = await fixture(null, { surfaceCount: 0 });
  const run = await runAccessibility(empty.config, { quiet: true });
  assert.equal(run.gate.exitCode, 2);
  assert.ok(run.findings.some((finding) => finding.ruleId === 'wcag-auditor/system/no-applicable-surface'));
});

test('required adapter failures become execution evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-auditor-missing-'));
  const run = await runAccessibility({
    schemaVersion: 1,
    project: { name: 'Missing', root },
    adapters: [{ type: 'native-evidence', file: 'missing.json' }],
    reporters: [{ type: 'json', file: 'run.json' }]
  }, { quiet: true });
  assert.equal(run.gate.exitCode, 2);
  assert.ok(run.findings.some((finding) => finding.outcome === 'executionError'));
});

test('reporters produce parseable and escaped output', async () => {
  const failing = await fixture('failed');
  const run = await runAccessibility(failing.config, { quiet: true });
  assert.equal(run.reportFiles.length, 5);
  JSON.parse(await fs.readFile(path.join(failing.root, '.wcag-audit-results', 'run.json'), 'utf8'));
  JSON.parse(await fs.readFile(path.join(failing.root, '.wcag-audit-results', 'run.sarif'), 'utf8'));
  const junit = renderJunitReport(run);
  assert.match(junit, /<testsuite/);
  assert.doesNotMatch(junit, /<unsafe>/);
  const html = renderHtmlReport(run);
  assert.match(html, /Skip to findings/);
  assert.doesNotMatch(html, /<unsafe>/);
  assert.match(renderSarifReport(run), /"version": "2.1.0"/);
});

test('optional missing dependencies skip without hiding applicable evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-auditor-optional-'));
  await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify({
    schemaVersion: 1,
    producer: { name: 'fixture', version: '1.0.0', kind: 'test' },
    surfaceCount: 1,
    findings: []
  }));
  const missing = Object.assign(new Error('Cannot find package svelte'), { code: 'ERR_MODULE_NOT_FOUND' });
  const run = await runAccessibility({
    schemaVersion: 1,
    project: { name: 'Optional', root },
    adapters: [
      { type: 'svelte', required: false },
      { type: 'native-evidence', file: 'evidence.json' }
    ],
    reporters: [{ type: 'json', file: 'run.json' }]
  }, { quiet: true, importModule: async () => { throw missing; } });
  assert.equal(run.gate.exitCode, 0);
  assert.equal(run.adapters[0].status, 'skipped');
});


test('invalid adapter findings become execution evidence instead of crashing reporters', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-auditor-invalid-finding-'));
  const run = await runAccessibility({
    schemaVersion: 1,
    project: { name: 'Invalid finding', root },
    adapters: [{ type: 'module', module: './unused.mjs' }],
    reporters: [{ type: 'json', file: 'run.json' }]
  }, {
    quiet: true,
    adapters: {
      module: async () => ({
        surfaceCount: 1,
        findings: [{ ruleId: 'broken', title: 'Broken', outcome: 'fictional', severity: 'serious' }]
      })
    }
  });
  assert.equal(run.gate.exitCode, 2);
  assert.ok(run.findings.some((finding) => finding.ruleId === 'wcag-auditor/system/adapter-execution'));
  const report = JSON.parse(await fs.readFile(path.join(root, '.wcag-audit-results', 'run.json'), 'utf8'));
  assert.deepEqual(report.reportFiles, ['.wcag-audit-results/run.json']);
});

test('non-serializable adapter metadata is contained as an execution failure', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-auditor-invalid-metadata-'));
  const circular = {};
  circular.self = circular;
  const run = await runAccessibility({
    schemaVersion: 1,
    project: { name: 'Invalid metadata', root },
    adapters: [{ type: 'module', module: './unused.mjs' }],
    reporters: [{ type: 'json', file: 'run.json' }]
  }, {
    quiet: true,
    adapters: { module: async () => ({ surfaceCount: 1, findings: [], metadata: circular }) }
  });
  assert.equal(run.gate.exitCode, 2);
  assert.equal(run.surfaceCount, 0);
  assert.ok(run.findings.some((finding) => finding.description.includes('circular reference')));
});

test('HTML report defines accessible status colors for light and dark modes', async () => {
  const failing = await fixture('failed');
  const run = await runAccessibility(failing.config, { quiet: true });
  const html = renderHtmlReport(run);
  assert.match(html, /--danger: #8b0000/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /--danger: #ffb4ab/);
});


test('console reporter renders every gate class, evidence location, suppression, and report paths', () => {
  const base = {
    id: 'run-console',
    project: { name: 'Console fixture' },
    profile: 'wcag22-aa',
    surfaceCount: 2,
    summary: { total: 3 },
    reportFiles: ['.wcag-audit-results/run.json'],
    findings: [
      {
        ruleId: 'fixture/fail',
        title: 'Broken control',
        description: 'Description\nwith spacing',
        remediation: 'Repair\tthe control',
        outcome: 'failed',
        severity: 'serious',
        fingerprint: 'abc',
        target: { file: 'src/App.svelte', line: 10, column: 4, selectorOrNode: '#save' }
      },
      {
        ruleId: 'fixture/review',
        title: 'Review focus',
        outcome: 'cantTell',
        severity: 'moderate',
        fingerprint: 'def',
        target: { routeOrScene: '/settings', state: 'open' }
      },
      {
        ruleId: 'fixture/suppressed',
        title: 'Suppressed',
        outcome: 'failed',
        severity: 'minor',
        fingerprint: 'ghi',
        target: { state: 'dialog-open' },
        suppressed: true
      }
    ]
  };

  const blocking = renderConsoleReport({
    ...base,
    gate: { passed: false, reason: 'blockingFindings', exitCode: 1 }
  }, { color: false });
  assert.match(blocking, /FAIL \(exit 1, blocking findings\)/);
  assert.match(blocking, /src\/App\.svelte:10:4 \(#save\)/);
  assert.match(blocking, /Description with spacing/);
  assert.match(blocking, /Fix: Repair the control/);
  assert.match(blocking, /1 finding\(s\) suppressed/);
  assert.match(blocking, /Reports: \.wcag-audit-results\/run\.json/);

  const unresolved = renderConsoleReport({ ...base, findings: [], summary: { total: 0 }, gate: { passed: false, reason: 'unresolvedEvidence', exitCode: 3 } }, { color: false });
  assert.match(unresolved, /UNRESOLVED \(exit 3\)/);
  assert.match(unresolved, /No active failed/);

  const execution = renderConsoleReport({ ...base, findings: [], summary: { total: 0 }, gate: { passed: false, reason: 'executionError', exitCode: 2 } }, { color: false });
  assert.match(execution, /ERROR \(exit 2, executionError\)/);

  const passing = renderConsoleReport({ ...base, findings: [], summary: { total: 0 }, gate: { passed: true, reason: 'passed', exitCode: 0 } }, { color: true });
  assert.match(passing, /\u001b\[32mPASS\u001b\[0m/);

  let captured = '';
  const result = writeConsoleReport({ ...base, findings: [], summary: { total: 0 }, gate: { passed: true, reason: 'passed', exitCode: 0 } }, {
    color: false,
    stream: { write(value) { captured += value; } }
  });
  assert.equal(result, null);
  assert.match(captured, /WCAG Auditor/);
});
