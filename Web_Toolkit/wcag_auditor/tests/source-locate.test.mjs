// ./Web_Toolkit/wcag_auditor/tests/source-locate.test.mjs
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { enrichFindingsWithSourceLocations } from '../src/core/source-locate.mjs';
import { renderDashboardReport } from '../src/reporters/dashboard.mjs';
import { runAccessibility } from '../src/core/runner.mjs';

test('source locator maps class selectors to markup file:line', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-source-locate-'));
  await fs.mkdir(path.join(root, 'src', 'layouts'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'styles'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'src', 'layouts', 'Layout.astro'),
    `<header class="site-header">\n  <a class="site-header__brand-name" href="/">Brand</a>\n</header>\n`
  );
  await fs.writeFile(
    path.join(root, 'src', 'styles', 'header.css'),
    `.site-header__brand-name { font-size: 1rem; }\n`
  );

  const [enriched] = enrichFindingsWithSourceLocations([{
    ruleId: 'target-size',
    title: 'Target size',
    outcome: 'failed',
    severity: 'serious',
    target: {
      routeOrScene: '/',
      selectorOrNode: '.site-header > .site-header__brand-name'
    },
    evidence: {
      html: '<a class="site-header__brand-name" href="/">Brand</a>'
    }
  }], { projectRoot: root });

  assert.equal(enriched.target.file, 'src/layouts/Layout.astro');
  assert.equal(enriched.target.line, 2);
  assert.equal(enriched.target.sourceKind, 'markup');
});

test('dashboard reporter highlights file:line and gate summary', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-dashboard-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'Page.astro'), `<a class="cta-link" href="/go">Go</a>\n`);
  await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify({
    schemaVersion: 1,
    producer: { name: 'fixture', version: '1.0.0', kind: 'test' },
    surfaceCount: 1,
    findings: [{
      ruleId: 'target-size',
      title: 'Target size',
      outcome: 'failed',
      severity: 'serious',
      target: { routeOrScene: '/', selectorOrNode: 'a.cta-link' },
      evidence: { html: '<a class="cta-link" href="/go">Go</a>' },
      remediation: 'Enlarge the control.'
    }]
  }));

  const run = await runAccessibility({
    schemaVersion: 1,
    project: { name: 'DashboardFixture', root },
    adapters: [{ type: 'native-evidence', file: 'evidence.json' }],
    reporters: [
      { type: 'json', file: 'run.json' },
      { type: 'dashboard', file: 'wcag-audit-dashboard.html' }
    ]
  }, { quiet: true });

  assert.equal(run.gate.exitCode, 1);
  const mapped = run.findings.find((f) => f.ruleId === 'target-size');
  assert.equal(mapped.target.file, 'src/Page.astro');
  assert.equal(mapped.target.line, 1);

  const dashboardPath = path.join(root, '.wcag-audit-results', 'wcag-audit-dashboard.html');
  const html = await fs.readFile(dashboardPath, 'utf8');
  assert.match(html, /WCAG audit dashboard/);
  assert.match(html, /src\/Page\.astro:1/);
  assert.match(html, /Stakeholder|How to use this dashboard/i);

  const rendered = renderDashboardReport(run);
  assert.match(rendered, /Unique fingerprints/);
});
