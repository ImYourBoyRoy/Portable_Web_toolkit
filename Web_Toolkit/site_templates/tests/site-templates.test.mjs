import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyInstall, insertImport, loadManifests, planInstall, readmeSections, renderPlan, renderShow, resolveOrder } from '../src/index.mjs';

const manifests = loadManifests();
const project = () => fs.mkdtempSync(path.join(os.tmpdir(), 'site-templates-'));

test('every template manifest points at files that exist and uses safe destinations', () => {
  assert.ok(manifests.size >= 5);
  for (const manifest of manifests.values()) {
    const plan = planInstall(project(), [manifest.name], { manifests });
    for (const rule of manifest.files ?? []) {
      assert.ok(plan.actions.filter((action) => action.template === manifest.name).length > 0, `${manifest.name}: ${rule.from} matched nothing`);
      assert.ok(!path.isAbsolute(rule.to) && !rule.to.includes('..'), `${manifest.name}: unsafe destination ${rule.to}`);
    }
    for (const required of manifest.requires ?? []) assert.ok(manifests.has(required), `${manifest.name} requires unknown ${required}`);
  }
});

test('prerequisites install first, in dependency order', () => {
  assert.deepEqual(resolveOrder(['layout'], manifests), ['theme', 'base', 'discovery', 'layout']);
  assert.deepEqual(resolveOrder(['analytics', 'layout'], manifests), ['theme', 'analytics', 'base', 'discovery', 'layout']);
  assert.throws(() => resolveOrder(['nope'], manifests), /Unknown template "nope"/);
});

test('add is a dry-run by default, apply copies to the right places and wires CSS imports once', () => {
  const root = project();
  const plan = planInstall(root, ['layout', 'analytics', 'contact'], { manifests });
  assert.ok(plan.actions.every((action) => action.status === 'new'));
  assert.equal(fs.existsSync(path.join(root, 'src')), false, 'planning writes nothing');
  assert.deepEqual(plan.manual, [], 'every prerequisite installs itself now, including discovery');
  assert.ok(plan.actions.some((action) => action.to === 'src/components/Schema.astro'), 'layout pulls in the discovery Schema component');
  const result = applyInstall(root, plan);
  for (const expected of ['src/components/layout/BaseLayout.astro', 'src/lib/head.ts', 'src/styles/layout/layout.css', 'src/data/site.json', 'src/lib/site-config.ts', 'tsconfig.json', 'src/env.d.ts', 'pnpm-workspace.yaml', 'src/components/analytics/AnalyticsConsent.astro', 'src/lib/analytics/consent.ts', 'src/pages/api/contact.ts', 'src/components/theme/ThemeInit.astro', '.dev.vars.example']) {
    assert.ok(fs.existsSync(path.join(root, expected)), expected);
  }
  assert.deepEqual(result.imported, ['./components/analytics-consent.css', './components/contact-form.css']);
  const css = fs.readFileSync(path.join(root, 'src/styles/global.css'), 'utf8');
  assert.equal((css.match(/analytics-consent\.css/g) ?? []).length, 1);

  const again = planInstall(root, ['layout', 'analytics', 'contact'], { manifests });
  assert.ok(again.actions.every((action) => action.status === 'same' || action.status === 'kept'));
  assert.deepEqual(applyInstall(root, again).imported, [], 'imports are idempotent');
});

test('differing files are never overwritten without --force, and edited data files are kept', () => {
  const root = project();
  applyInstall(root, planInstall(root, ['layout'], { manifests }));
  const header = path.join(root, 'src/components/layout/SiteHeader.astro');
  fs.writeFileSync(header, 'edited by a human');
  fs.writeFileSync(path.join(root, 'src/data/site.json'), '{"siteName":"Mine"}');
  const plan = planInstall(root, ['layout'], { manifests });
  assert.equal(plan.actions.find((action) => action.to.endsWith('SiteHeader.astro')).status, 'differs');
  assert.equal(plan.actions.find((action) => action.to.endsWith('site.json')).status, 'kept');
  applyInstall(root, plan);
  assert.equal(fs.readFileSync(header, 'utf8'), 'edited by a human');
  assert.match(renderPlan(plan, { apply: true }), /DIFFERS src\/components\/layout\/SiteHeader\.astro/);
  const forced = planInstall(root, ['layout'], { manifests, force: true });
  applyInstall(root, forced);
  assert.notEqual(fs.readFileSync(header, 'utf8'), 'edited by a human');
});

test('a manifest cannot write outside the project', () => {
  const root = project();
  const evil = new Map([['evil', { name: 'evil', directory: path.join(manifests.get('theme').directory), files: [{ from: 'ThemeInit.astro', to: '../escaped/' }] }]]);
  assert.throws(() => planInstall(root, ['evil'], { manifests: evil }), /escapes the project/);
});

test('CSS imports are inserted before any rule, after existing imports and the leading comment', () => {
  const css = '/* ./src/styles/global.css */\n@import \'./tokens.css\';\n\n*, *::before {\n  box-sizing: border-box;\n}\n';
  const next = insertImport(css, './themes/index.css');
  assert.equal(next.split('\n').findIndex((line) => line.includes('themes/index.css')), 2);
  assert.ok(next.indexOf('@import \'./themes/index.css\'') < next.indexOf('box-sizing'));
  assert.equal(insertImport('body { margin: 0 }', './a.css').split('\n')[0], "@import './a.css';");
  assert.equal(insertImport('', './a.css'), "@import './a.css';\n");
});

test('contact installs only the simple form; contact-intake adds the multi-field handler on top', () => {
  const simple = planInstall(project(), ['contact'], { manifests }).actions.map((action) => action.to);
  assert.ok(simple.includes('src/lib/contact/contact-lib.ts'));
  assert.ok(simple.includes('src/lib/contact/intake-lib.ts'), 'contact.ts imports the shared helpers from intake-lib');
  assert.ok(!simple.some((file) => /handle-intake/.test(file)), 'a plain contact form carries no intake handler');
  const full = planInstall(project(), ['contact-intake'], { manifests });
  assert.deepEqual(full.order.slice(-2), ['contact', 'contact-intake']);
  const files = full.actions.map((action) => action.to);
  assert.ok(files.includes('src/lib/contact/handle-intake.ts'));
  assert.deepEqual(full.actions.filter((action) => action.template === 'contact-intake').map((action) => action.to), ['src/lib/contact/handle-intake.ts']);
});

test('the plan prints one line per template by default, every file with --verbose, and never repeats a follow-up', () => {
  const plan = planInstall(project(), ['contact', 'contact-intake'], { manifests });
  const compact = renderPlan(plan, { apply: false });
  const verbose = renderPlan(plan, { apply: false, verbose: true });
  assert.match(compact, /add    contact-intake: src\/lib\/contact\/ x1/);
  assert.ok(!compact.includes('handle-intake.ts'), 'compact plan does not list file names');
  assert.match(verbose, /add\s+src\/lib\/contact\/handle-intake\.ts/);
  assert.ok(compact.length < verbose.length);
  assert.equal((compact.match(/form-doctor\.mjs/g) ?? []).length, 1, 'shared follow-up appears once');
});

test('show prints a compact contract and can return one README section', () => {
  const layout = manifests.get('layout');
  const summary = renderShow(layout, { manifests, projectRoot: project() });
  assert.match(summary, /^layout: /);
  assert.match(summary, /needs: theme, discovery/);
  assert.match(summary, /installs src\/components\/layout\/ \(5\)/);
  assert.match(summary, /README sections .*BaseLayout props and slots \[\d+l\]/);
  assert.ok(summary.length < 2500);
  const section = renderShow(layout, { manifests, section: 'props' });
  assert.match(section, /^## BaseLayout props and slots/);
  assert.ok(!section.includes('## What BaseHead emits'), 'only the requested section');
  assert.throws(() => renderShow(layout, { manifests, section: 'nope' }), /No section matching "nope"/);
  assert.ok(readmeSections(layout).length >= 5);
});

test('a CRLF copy of a template file (Windows autocrlf) counts as identical, and CSS imports keep the file\'s line endings', () => {
  const root = project();
  applyInstall(root, planInstall(root, ['theme'], { manifests }));
  const file = path.join(root, 'src/components/theme/ThemeInit.astro');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  const again = planInstall(root, ['theme'], { manifests });
  assert.ok(again.actions.every((action) => action.status === 'same'), 'CRLF only is not a difference');
  const crlf = "/* x */\r\n@import './tokens.css';\r\n\r\nbody { margin: 0 }\r\n";
  const next = insertImport(crlf, './themes/index.css');
  assert.ok(!/[^\r]\n/.test(next), 'no bare LF was introduced into a CRLF file');
  assert.match(next, /@import '\.\/themes\/index\.css';\r\n/);
});
