import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runCommandEvidenceAdapter } from '../src/adapters/command-evidence.mjs';
import { runManualEvidenceAdapter, validateEvidenceDocument } from '../src/adapters/manual-evidence.mjs';
import { runModuleAdapter } from '../src/adapters/module.mjs';
import { runNativeEvidenceAdapter, parseNativeEvidenceDocument } from '../src/adapters/native-evidence.mjs';
import { runPlaywrightAxeAdapter } from '../src/adapters/playwright-axe.mjs';
import { runSvelteAdapter } from '../src/adapters/svelte.mjs';

async function temporaryDirectory() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'wcag-auditor-adapters-'));
}

function context(root, overrides = {}) {
  return {
    runId: 'run-1',
    now: new Date('2026-07-30T12:00:00.000Z'),
    projectName: 'Fixture',
    projectRoot: root,
    outputDirectory: path.join(root, '.wcag-audit-results'),
    adapterName: 'adapter',
    profile: 'wcag22-aa',
    metadata: {},
    ...overrides
  };
}

test('manual evidence emits expired governance evidence without trusting stale pass', async () => {
  const root = await temporaryDirectory();
  await fs.writeFile(path.join(root, 'manual.json'), JSON.stringify({
    schemaVersion: 1,
    project: 'Fixture',
    checks: [{
      id: 'keyboard',
      title: 'Keyboard workflow',
      outcome: 'passed',
      severity: 'serious',
      tester: 'Tester',
      testedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-02-01T00:00:00.000Z',
      environment: 'Linux',
      evidence: 'Completed workflow'
    }]
  }));
  const result = await runManualEvidenceAdapter({ file: 'manual.json' }, context(root));
  assert.equal(result.surfaceCount, 1);
  assert.equal(result.findings[0].outcome, 'untested');
  assert.equal(result.findings[1].ruleId, 'wcag-auditor/evidence/expired');
});

test('native evidence validates producer and finding contracts', async () => {
  const document = {
    schemaVersion: 1,
    producer: { name: 'bevy-export', version: '1.0.0', kind: 'bevy-accesskit' },
    surfaceCount: 2,
    findings: [{ ruleId: 'bevy/name', title: 'Name missing', outcome: 'failed', severity: 'serious' }]
  };
  assert.equal(parseNativeEvidenceDocument(document).surfaceCount, 2);
  assert.throws(() => parseNativeEvidenceDocument({ ...document, producer: null }), /producer is required/);

  const root = await temporaryDirectory();
  await fs.writeFile(path.join(root, 'native.json'), JSON.stringify(document));
  const result = await runNativeEvidenceAdapter({ file: 'native.json' }, context(root));
  assert.equal(result.findings[0].target.adapter, 'adapter');
  assert.ok(result.findings[0].tags.includes('bevy-accesskit'));
});

test('command evidence executes without a shell and parses strict output', async () => {
  const root = path.resolve('tests/fixtures');
  const result = await runCommandEvidenceAdapter({
    command: process.execPath,
    args: ['evidence-producer.mjs'],
    cwd: '.',
    timeoutMs: 5000
  }, context(root));
  assert.equal(result.surfaceCount, 1);
  assert.equal(result.findings[0].ruleId, 'fixture/rule');
});

test('Svelte adapter consumes compiler AST diagnostics instead of source regexes', async () => {
  const root = await temporaryDirectory();
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'Button.svelte'), '<div onclick={() => {}}>Open</div>');
  const result = await runSvelteAdapter({ include: ['src/**/*.svelte'] }, context(root, {
    modules: {
      svelteCompiler: {
        compile() {
          return {
            warnings: [{
              code: 'a11y_click_events_have_key_events',
              message: 'Visible, non-interactive elements with click events must have keyboard handlers',
              start: { line: 1, column: 0 }
            }]
          };
        }
      }
    }
  }));
  assert.equal(result.surfaceCount, 1);
  assert.equal(result.findings[0].ruleId, 'svelte/a11y_click_events_have_key_events');
  assert.equal(result.findings[0].severity, 'serious');
});

test('Playwright adapter maps axe violations, incomplete checks, and runtime probes', async () => {
  let focusCalls = 0;
  const fakePage = {
    async goto() {},
    async close() {},
    async screenshot() {},
    locator() { return { click: async () => {}, fill: async () => {}, waitFor: async () => {} }; },
    keyboard: { press: async () => {} },
    async evaluate(fn) {
      const source = fn.toString();
      if (source.includes('document.querySelectorAll')) {
        return [{ selector: '#small', width: 20, height: 20, belowMinimum: true, text: 'Small' }];
      }
      focusCalls += 1;
      return focusCalls === 1
        ? { selector: '#button', role: 'button', name: 'Button', visible: true, obviousIndicator: false, outlineStyle: 'none', outlineWidth: '0px', outlineColor: 'transparent', boxShadow: 'none', rect: { x: 0, y: 0, width: 44, height: 44 } }
        : null;
    }
  };
  const fakeContext = { newPage: async () => fakePage, close: async () => {} };
  const fakeBrowser = { newContext: async () => fakeContext, close: async () => {} };
  const playwright = { chromium: { launch: async () => fakeBrowser } };
  class AxeBuilder {
    withTags() { return this; }
    include() { return this; }
    exclude() { return this; }
    options() { return this; }
    async analyze() {
      return {
        violations: [{
          id: 'button-name',
          impact: 'critical',
          help: 'Buttons must have discernible text',
          description: 'Ensure buttons have names',
          helpUrl: 'https://example.test/button-name',
          tags: ['wcag412'],
          nodes: [{ target: ['#bad'], html: '<button></button>', failureSummary: 'Fix the button' }]
        }],
        incomplete: [{
          id: 'color-contrast',
          impact: 'serious',
          help: 'Contrast needs review',
          tags: ['wcag143'],
          nodes: [{ target: ['#text'], html: '<p>Text</p>' }]
        }],
        passes: [{ id: 'html-has-lang', nodes: [{ target: ['html'] }] }],
        inapplicable: []
      };
    }
  }
  const result = await runPlaywrightAxeAdapter({
    baseURL: 'https://example.test',
    scenarios: [{ name: 'home', path: '/', steps: [] }],
    probes: {
      targetSizeEnhanced: { enabled: true, minimum: 44 },
      focusIndicatorReview: { enabled: true, maxTabs: 2 }
    }
  }, context('/tmp', { modules: { playwright, axePlaywright: { AxeBuilder } } }));
  assert.ok(result.findings.some((finding) => finding.ruleId === 'axe/button-name' && finding.outcome === 'failed'));
  assert.ok(result.findings.some((finding) => finding.ruleId === 'axe/color-contrast' && finding.outcome === 'cantTell'));
  assert.ok(result.findings.some((finding) => finding.ruleId === 'wcag-auditor/runtime/target-size-enhanced'));
  assert.ok(result.findings.some((finding) => finding.ruleId === 'wcag-auditor/runtime/focus-indicator-review'));
  assert.ok(result.surfaceCount >= 4);
});


test('manual passed evidence requires bounded expiration and rejects future testing', async () => {
  const invalid = {
    schemaVersion: 1,
    checks: [{
      id: 'keyboard',
      title: 'Keyboard workflow',
      outcome: 'passed',
      severity: 'serious',
      tester: 'Tester',
      testedAt: '2026-07-01T00:00:00.000Z',
      expiresAt: null,
      environment: 'Linux',
      evidence: 'Completed workflow'
    }]
  };
  assert.ok(validateEvidenceDocument(invalid).some((error) => error.includes('expiresAt is required')));

  const root = await temporaryDirectory();
  invalid.checks[0].expiresAt = '2026-09-01T00:00:00.000Z';
  invalid.checks[0].testedAt = '2026-08-01T00:00:00.000Z';
  await fs.writeFile(path.join(root, 'manual.json'), JSON.stringify(invalid));
  await assert.rejects(
    runManualEvidenceAdapter({ file: 'manual.json' }, context(root)),
    /future testedAt/
  );
});

test('module adapter uses the injected importer and enforces the result contract', async () => {
  const root = await temporaryDirectory();
  const requested = [];
  const result = await runModuleAdapter({ module: './custom.mjs', options: { mode: 'strict' } }, context(root, {
    importModule: async (specifier) => {
      requested.push(specifier);
      return {
        runAdapter: async (options, adapterContext) => ({
          surfaceCount: 1,
          findings: [{
            ruleId: 'module/example',
            title: options.mode,
            outcome: 'passed',
            severity: 'advisory',
            target: { adapter: adapterContext.adapterName }
          }]
        })
      };
    }
  }));
  assert.equal(result.surfaceCount, 1);
  assert.equal(result.findings[0].title, 'strict');
  assert.match(requested[0], /custom\.mjs\?run=run-1$/);

  await assert.rejects(
    runModuleAdapter({ module: './bad.mjs' }, context(root, { importModule: async () => ({ default: async () => ({}) }) })),
    /invalid result/
  );
});

test('Svelte compiler safety options cannot be overridden by project config', async () => {
  const root = await temporaryDirectory();
  await fs.mkdir(path.join(root, 'src'));
  const file = path.join(root, 'src', 'App.svelte');
  await fs.writeFile(file, '<button>Save</button>');
  let observed;
  await runSvelteAdapter({
    compilerOptions: { filename: '/wrong.svelte', generate: 'client' }
  }, context(root, {
    modules: {
      svelteCompiler: {
        compile(_source, options) {
          observed = options;
          return { warnings: [] };
        }
      }
    }
  }));
  assert.equal(observed.filename, file);
  assert.equal(observed.generate, false);
});


test('Playwright adapter starts and stops a managed web server', async () => {
  const port = await reservePort();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const fixture = path.join(root, 'tests', 'fixtures', 'http-server.mjs');
  const fakePage = {
    async goto(url) {
      const response = await fetch(url);
      assert.equal(response.status, 200);
    },
    async close() {},
    locator() { return { waitFor: async () => {} }; },
    keyboard: { press: async () => {} },
    async evaluate() { return null; }
  };
  const fakeContext = { newPage: async () => fakePage, close: async () => {} };
  const fakeBrowser = { newContext: async () => fakeContext, close: async () => {} };
  const playwright = { chromium: { launch: async () => fakeBrowser } };
  class AxeBuilder {
    withTags() { return this; }
    async analyze() {
      return { violations: [], incomplete: [], passes: [{ id: 'document-title', nodes: [{ target: ['html'] }] }], inapplicable: [] };
    }
  }

  const baseURL = `http://127.0.0.1:${port}`;
  const result = await runPlaywrightAxeAdapter({
    baseURL,
    webServer: {
      command: process.execPath,
      args: [fixture],
      env: { PORT: String(port) },
      timeoutMs: 5_000,
      reuseExistingServer: false
    },
    scenarios: [{ name: 'managed', path: '/', steps: [] }]
  }, context(root, { modules: { playwright, axePlaywright: { AxeBuilder } } }));

  assert.equal(result.metadata.webServer.reused, false);
  assert.equal(result.metadata.webServer.readyURL, baseURL);
  await assert.rejects(fetch(baseURL), /fetch failed|ECONNREFUSED/);
});

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}
