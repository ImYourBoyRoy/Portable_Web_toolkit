/**
 * Wrapper overlay tests use stub engines, so they never depend on (or resolve) a WCAGate checkout.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BASELINE_FILE,
  applyOverlays,
  detectEngineFeatures,
  engineCliArgs,
  finishOverlays,
  requestedOverlays
} from '../src/toolkit/overlays.mjs';
import { buildAstroConfigObject, matrixFromProfile, unresolvedEvidenceFromProfile } from '../src/toolkit/profile-config.mjs';

function modernEngine(calls = []) {
  return {
    TOOLKIT_VERSION: '2.4.0',
    firstBaseUrl: (config) => config.adapters.find((adapter) => adapter.baseURL)?.baseURL ?? null,
    applyRunOverrides: (config, overlays) => { calls.push(['applyRunOverrides', overlays]); return config; },
    expandScenarioMatrix: (scenarios) => scenarios,
    routesFromSitemap: async (options) => { calls.push(['routesFromSitemap', options]); return { routes: ['/', '/about/'], source: `${options.baseUrl}/sitemap.xml`, truncated: false }; },
    readBaseline: async (file) => { calls.push(['readBaseline', file]); return { schemaVersion: 1, entries: [] }; },
    createBaseline: () => ({ schemaVersion: 1, entries: [{ key: 'a', ruleId: 'r' }] }),
    writeBaseline: async (file, document) => { calls.push(['writeBaseline', file, document.entries.length]); },
    applyBaseline: () => ({})
  };
}

const OLD_ENGINE = { TOOLKIT_VERSION: '2.3.1', applyRunOverrides: () => {} };

test('engine features are detected from the API, not a version string', () => {
  assert.deepEqual(detectEngineFeatures(modernEngine()), { matrix: true, sitemap: true, baseline: true, probes: true, agent: false });
  assert.deepEqual(detectEngineFeatures(OLD_ENGINE), { matrix: false, sitemap: false, baseline: false, probes: false, agent: false });
});

test('flags win over the site profile and baseline flags default to the committed path', () => {
  const profile = { diagnostics: { wcagAuditor: { sitemap: true, maxRoutes: 9, baseline: 'x/b.json', matrix: { colorSchemes: ['dark'], viewports: ['mobile'] } } } };
  const fromProfile = requestedOverlays({}, profile);
  assert.deepEqual(fromProfile.sitemap, { source: undefined });
  assert.equal(fromProfile.maxRoutes, 9);
  assert.equal(fromProfile.baseline, 'x/b.json');
  assert.deepEqual(fromProfile.colorSchemes, ['dark']);

  const flagged = requestedOverlays({ routes: '/a,/b', 'color-schemes': 'light,dark', baseline: true, 'write-baseline': true }, profile);
  assert.deepEqual(flagged.routes, ['/a', '/b']);
  assert.equal(flagged.sitemap, null, 'explicit routes beat the sitemap');
  assert.deepEqual(flagged.colorSchemes, ['light', 'dark']);
  assert.equal(flagged.baseline, DEFAULT_BASELINE_FILE);
  assert.equal(flagged.writeBaseline, DEFAULT_BASELINE_FILE);
  assert.equal(requestedOverlays({ sitemap: 'https://x.test/sitemap.xml' }, {}).sitemap.source, 'https://x.test/sitemap.xml');
});

test('overlays call the engine with sitemap routes, matrix, and a loaded baseline', async () => {
  const calls = [];
  const config = { adapters: [{ type: 'playwright-axe', baseURL: 'http://127.0.0.1:4321' }] };
  const logs = [];
  const overlays = await applyOverlays({
    api: modernEngine(calls),
    config,
    flags: { sitemap: true, 'color-schemes': 'light,dark', viewports: 'mobile', baseline: 'wcag-audit/baseline.json', 'write-baseline': 'out.json' },
    profile: {},
    projectRoot: '/proj',
    log: (message) => logs.push(message)
  });
  assert.deepEqual(calls[0], ['routesFromSitemap', { baseUrl: 'http://127.0.0.1:4321', source: undefined, limit: 50 }]);
  assert.deepEqual(calls[1], ['applyRunOverrides', { routes: ['/', '/about/'], colorSchemes: ['light', 'dark'], viewports: ['mobile'] }]);
  assert.equal(calls[2][0], 'readBaseline');
  assert.match(calls[2][1].replace(/\\/g, '/'), /\/proj\/wcag-audit\/baseline\.json$/);
  assert.equal(overlays.baseline.file, 'wcag-audit/baseline.json');
  assert.equal(overlays.writeBaseline, 'out.json');
  assert.match(logs[0], /sitemap .*2 route/);

  const written = await finishOverlays({ api: modernEngine(calls), run: { baseline: { file: 'f', known: 1, new: 2, fixed: 3 } }, overlays, projectRoot: '/proj', log: (m) => logs.push(m) });
  assert.equal(written, 1);
  assert.equal(calls.at(-1)[0], 'writeBaseline');
  assert.ok(logs.some((line) => /1 known .* 2 new, 3 fixed/.test(line)));
});

test('an engine older than 2.4 is refused for flags it would silently ignore', async () => {
  const config = { adapters: [{ type: 'playwright-axe', baseURL: 'http://127.0.0.1:4321' }] };
  const attempt = (flags) => applyOverlays({ api: OLD_ENGINE, config, flags, profile: {}, projectRoot: '/p' });
  await assert.rejects(attempt({ 'color-schemes': 'dark' }), /needs WCAGate 2\.4 or newer.*2\.3\.1.*--update-engine/s);
  await assert.rejects(attempt({ sitemap: true }), /--sitemap needs WCAGate 2\.4/);
  await assert.rejects(attempt({ baseline: true }), /--baseline needs WCAGate 2\.4/);
  await assert.rejects(attempt({ 'write-baseline': true }), /--write-baseline needs WCAGate 2\.4/);
  const plain = await attempt({ routes: '/a' });
  assert.equal(plain.baseline, undefined, 'routes alone work on any engine');
});

test('a sitemap with no origin to audit is an error, not a silent skip', async () => {
  await assert.rejects(
    applyOverlays({ api: modernEngine(), config: { adapters: [] }, flags: { sitemap: true }, profile: {}, projectRoot: '/p' }),
    /--sitemap needs --base-url/
  );
});

test('engine CLI args forward only the flags that were given', () => {
  assert.deepEqual(engineCliArgs({}), []);
  assert.deepEqual(
    engineCliArgs({ 'base-url': 'http://x', routes: '/a', sitemap: true, 'max-routes': '5', 'color-schemes': 'dark', viewports: 'mobile', baseline: true, 'write-baseline': 'b.json', 'skip-playwright-install': true }),
    ['--base-url', 'http://x', '--routes', '/a', '--max-routes', '5', '--color-schemes', 'dark', '--viewports', 'mobile', '--sitemap', '--baseline', DEFAULT_BASELINE_FILE, '--write-baseline', 'b.json', '--skip-playwright-install']
  );
});

test('profile config adds probes and matrix only when the engine supports them', () => {
  const profile = { siteId: 'demo', diagnostics: { wcagAuditor: { profile: 'wcag22-aa', matrix: { colorSchemes: ['light', 'dark'], viewports: ['mobile'] } } } };
  const old = buildAstroConfigObject({ profile, projectRoot: '/tmp/demo' });
  const oldAdapter = old.adapters.find((adapter) => adapter.type === 'playwright-axe');
  assert.equal(oldAdapter.matrix, undefined, 'an old engine rejects unknown keys');
  assert.equal(oldAdapter.probes.reflow, undefined);

  const modern = buildAstroConfigObject({ profile, projectRoot: '/tmp/demo', engineFeatures: detectEngineFeatures(modernEngine()) });
  const adapter = modern.adapters.find((candidate) => candidate.type === 'playwright-axe');
  assert.deepEqual(adapter.matrix, { colorSchemes: ['light', 'dark'], viewports: ['mobile'] });
  assert.deepEqual(adapter.probes.reflow, { enabled: true });
  assert.deepEqual(adapter.probes.textSpacing, { enabled: true });

  const levelA = buildAstroConfigObject({ profile: { diagnostics: { wcagAuditor: { profile: 'wcag22-a' } } }, projectRoot: '/tmp/demo', engineFeatures: { probes: true } });
  assert.deepEqual(levelA.adapters.at(-1).probes.reflow, { enabled: false });
});

test('profile matrix and unresolved-evidence options are normalized', () => {
  assert.equal(matrixFromProfile({}), null);
  assert.equal(matrixFromProfile({ diagnostics: { wcagAuditor: { matrix: {} } } }), null);
  assert.deepEqual(matrixFromProfile({ diagnostics: { wcagAuditor: { matrix: { viewports: ['tablet'] } } } }), { viewports: ['tablet'] });
  assert.equal(unresolvedEvidenceFromProfile({}, false), 'ignore');
  assert.equal(unresolvedEvidenceFromProfile({}, true), 'error');
  assert.equal(unresolvedEvidenceFromProfile({ diagnostics: { wcagAuditor: { unresolvedEvidence: 'error' } } }, false), 'error');
  assert.equal(unresolvedEvidenceFromProfile({ diagnostics: { wcagAuditor: { unresolvedEvidence: 'bogus' } } }, false), 'ignore');
});

test('agent report support is detected from the API and gates the reporter and report command', () => {
  const agentEngine = { ...modernEngine(), renderAgentReport: () => '', readPreviousRun: async () => null, groupDetail: () => ({}) };
  assert.equal(detectEngineFeatures(agentEngine).agent, true);
  assert.equal(detectEngineFeatures(modernEngine()).agent, false);
  assert.equal(detectEngineFeatures(OLD_ENGINE).agent, false);

  const profile = { siteId: 'demo' };
  const withAgent = buildAstroConfigObject({ profile, projectRoot: '/tmp/demo', engineFeatures: detectEngineFeatures(agentEngine) });
  assert.ok(withAgent.reporters.some((reporter) => reporter.type === 'agent' && reporter.file === 'agent.md'));
  const without = buildAstroConfigObject({ profile, projectRoot: '/tmp/demo', engineFeatures: detectEngineFeatures(OLD_ENGINE) });
  assert.ok(!without.reporters.some((reporter) => reporter.type === 'agent'), 'an engine without the agent reporter rejects the unknown type');
});

test('the previous run is the newest earlier output folder of the same site, never the one being written', async () => {
  const { findLatestRunFile, safeSiteId } = await import('../src/toolkit/latest-run.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wcag-latest-'));
  const make = (name, file) => { fs.mkdirSync(path.join(root, 'output', name), { recursive: true }); if (file) fs.writeFileSync(path.join(root, 'output', name, file), '{}'); };
  make('wcag-auditor-demo-2026-11-01T10-00-00-000Z', 'wcag-audit.json');
  make('wcag-auditor-demo-2026-11-02T10-00-00-000Z', 'wcag-audit.json');
  make('wcag-auditor-demo-2026-11-03T10-00-00-000Z', null); // a run that never wrote its report
  make('wcag-auditor-other-2026-11-04T10-00-00-000Z', 'wcag-audit.json');
  const current = path.join(root, 'output', 'wcag-auditor-demo-2026-11-05T10-00-00-000Z');
  fs.mkdirSync(current);
  fs.writeFileSync(path.join(current, 'wcag-audit.json'), '{}');
  assert.match(findLatestRunFile(root, 'demo', { exclude: current }), /2026-11-02T10-00-00-000Z[\\/]wcag-audit\.json$/);
  assert.match(findLatestRunFile(root, 'demo'), /2026-11-05/);
  assert.equal(findLatestRunFile(root, 'nobody'), null);
  assert.equal(findLatestRunFile(path.join(root, 'missing'), 'demo'), null);
  assert.equal(safeSiteId('a b/c'), 'a-b-c');
  fs.rmSync(root, { recursive: true, force: true });
});
