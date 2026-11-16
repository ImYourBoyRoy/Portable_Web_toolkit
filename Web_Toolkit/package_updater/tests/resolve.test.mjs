import assert from 'node:assert/strict';
import test from 'node:test';
import { compare, maxSatisfying, parse, satisfies, validRange } from '../../shared/lib/semver-lite.mjs';
import { formatRange, isRegistrySpec, resolveToolchain } from '../src/lib/resolve.mjs';

const doc = (versions) => pk('x', versions);
const pk = (name, versions) => ({ name, latest: versions[0][0], versions: new Map(versions.map(([version, meta = {}]) => [version, { peerDependencies: {}, dependencies: {}, engines: {}, deprecated: false, ...meta }])) });

test('semver-lite handles the grammar published in peerDependencies', () => {
  assert.equal(satisfies('6.0.3', '^5.0.0 || ^6.0.0'), true);
  assert.equal(satisfies('7.0.0', '^5.0.0 || ^6.0.0'), false);
  assert.equal(satisfies('8.3.6', '^8.0.0'), true);
  assert.equal(satisfies('0.9.12', '^0.9.0'), true);
  assert.equal(satisfies('0.10.0', '^0.9.0'), false);
  assert.equal(satisfies('1.5.0', '>=1 <2'), true);
  assert.equal(satisfies('2.0.0', '>=1 <2'), false);
  assert.equal(satisfies('3.4.5', '3.x'), true);
  assert.equal(satisfies('3.5.0', '~3.4.0'), false);
  assert.equal(satisfies('2.0.0', '1.0.0 - 2.0.0'), true);
  assert.equal(satisfies('5.0.0-rc.1', '^5.0.0'), false, 'prereleases do not match unless named');
  assert.equal(satisfies('9.9.9', '*'), true);
  assert.equal(satisfies('1.0.0', 'workspace:*'), false);
  assert.equal(validRange('>=26'), true);
  assert.equal(maxSatisfying(['1.0.0', '1.2.0', '2.0.0'], '^1.0.0'), '1.2.0');
  assert.ok(compare('1.0.0-rc.1', '1.0.0') < 0 && compare('1.10.0', '1.9.0') > 0);
  assert.equal(parse('v2.3.1').minor, 3);
});

test('typescript holds on 6.x while @astrojs/check peers ^5 || ^6, with the reason', () => {
  const result = resolveToolchain({
    dependencies: { astro: '^7.4.7', '@astrojs/check': '^0.9.12', typescript: '^6.0.3' },
    packuments: {
      astro: pk('astro', [['7.5.0'], ['7.4.7']]),
      '@astrojs/check': pk('@astrojs/check', [['0.9.13', { peerDependencies: { typescript: '^5.0.0 || ^6.0.0' } }], ['0.9.12', { peerDependencies: { typescript: '^5.0.0 || ^6.0.0' } }]]),
      typescript: pk('typescript', [['7.0.1'], ['6.0.8'], ['6.0.3']])
    },
    policy: { anchors: ['astro'] }
  });
  assert.equal(result.choices.typescript.chosen, '6.0.8');
  assert.equal(result.choices.typescript.majorHeld, true);
  assert.match(result.choices.typescript.reason, /@astrojs\/check@0\.9\.13 peers typescript \^5\.0\.0 \|\| \^6\.0\.0/);
  assert.equal(result.choices.astro.chosen, '7.5.0');
  assert.equal(formatRange('^6.0.3', result.choices.typescript), '^6.0.8');
});

test('the hold lifts itself once @astrojs/check allows the new major', () => {
  const result = resolveToolchain({
    dependencies: { '@astrojs/check': '^0.9.12', typescript: '^6.0.3' },
    packuments: {
      '@astrojs/check': pk('@astrojs/check', [['0.10.0', { peerDependencies: { typescript: '^5 || ^6 || ^7' } }]]),
      typescript: pk('typescript', [['7.0.1'], ['6.0.8']])
    }
  });
  assert.equal(result.choices.typescript.chosen, '7.0.1');
  assert.equal(result.choices.typescript.heldBack, false);
});

test('an anchor holds back to the previous major when an integration lags, and names the laggard', () => {
  const result = resolveToolchain({
    dependencies: { astro: '^7.4.7', '@astrojs/cloudflare': '^14.4.6' },
    packuments: {
      astro: pk('astro', [['8.0.0'], ['7.9.0']]),
      '@astrojs/cloudflare': pk('@astrojs/cloudflare', [['14.9.0', { peerDependencies: { astro: '^7.0.0' } }]])
    },
    policy: { anchors: ['astro'] }
  });
  assert.equal(result.choices.astro.chosen, '7.9.0');
  assert.equal(result.choices.astro.majorHeld, true);
  assert.match(result.choices.astro.reason, /no release for astro 8\.x yet/);
  assert.equal(result.choices['@astrojs/cloudflare'].chosen, '14.9.0');
});

test('the anchor moves to the new major when the integration supports it', () => {
  const result = resolveToolchain({
    dependencies: { astro: '^7.4.7', '@astrojs/cloudflare': '^14.4.6' },
    packuments: {
      astro: pk('astro', [['8.0.0'], ['7.9.0']]),
      '@astrojs/cloudflare': pk('@astrojs/cloudflare', [['15.0.0', { peerDependencies: { astro: '^8.0.0' } }], ['14.9.0', { peerDependencies: { astro: '^7.0.0' } }]])
    },
    policy: { anchors: ['astro'] }
  });
  assert.equal(result.choices.astro.chosen, '8.0.0');
  assert.equal(result.choices['@astrojs/cloudflare'].chosen, '15.0.0');
});

test('policy holds, ignores, non-registry specs, and fetch failures are reported, never guessed', () => {
  const result = resolveToolchain({
    dependencies: { a: '^1.0.0', b: 'file:../b', c: '^2.0.0', d: 'workspace:*', e: '^1.0.0' },
    packuments: { a: pk('a', [['2.0.0'], ['1.4.0']]), c: pk('c', [['2.1.0']]), e: { error: 'HTTP 503' } },
    policy: { holds: { a: { range: '^1', reason: 'API break' } }, ignore: ['c'] }
  });
  assert.equal(result.choices.a.chosen, '1.4.0');
  assert.match(result.choices.a.reason, /holds \(API break\)/);
  assert.ok(!('c' in result.choices));
  assert.deepEqual(result.skipped.sort(), ['b', 'c', 'd']);
  assert.deepEqual(result.failed, [{ name: 'e', error: 'HTTP 503' }]);
  assert.equal(isRegistrySpec('github:x/y'), false);
  assert.equal(isRegistrySpec('^1.2.3'), true);
});

test('range operators are preserved and a >= floor is bounded below a held-back major', () => {
  const held = { chosen: '6.0.8', majorHeld: true };
  const free = { chosen: '8.3.7', majorHeld: false };
  assert.equal(formatRange('^6.0.3', held), '^6.0.8');
  assert.equal(formatRange('~6.0.3', held), '~6.0.8');
  assert.equal(formatRange('>=6.0.3', held), '>=6.0.8 <7');
  assert.equal(formatRange('>=8', free), '>=8.3.7');
  assert.equal(formatRange('8.3.6', free), '^8.3.7');
});

test('a transitive exact dependency elsewhere does not hold a package back, but an anchor dependency does', () => {
  const packuments = {
    astro: pk('astro', [['7.5.0', { dependencies: { vite: '^8.0.0' } }]]),
    vite: pk('vite', [['9.0.0'], ['8.3.8']]),
    yaml: pk('yaml', [['2.9.1'], ['2.8.3']]),
    'yaml-language-server': pk('yaml-language-server', [['2.0.0', { dependencies: { yaml: '2.8.3' } }]])
  };
  const result = resolveToolchain({ dependencies: { astro: '^7.4.0', vite: '^8.3.0', yaml: '^2.9.1', 'yaml-language-server': '^2.0.0' }, packuments, policy: { anchors: ['astro'] } });
  assert.equal(result.choices.yaml.chosen, '2.9.1', 'overridable transitive pin is ignored');
  assert.equal(result.choices.vite.chosen, '8.3.8', 'astro depends on vite ^8, so vite 9 would duplicate the bundler');
  assert.match(result.choices.vite.reason, /astro@7\.5\.0 depends on vite \^8\.0\.0/);
});

test('versions inside the release-age window are never chosen, and the hold says when it lifts', () => {
  const fresh = doc([['4.163.0'], ['4.162.2'], ['4.162.0']]);
  fresh.versions.get('4.163.0').tooNew = true;
  fresh.versions.get('4.163.0').publishedAt = '2026-11-16T01:04:39.000Z';
  const result = resolveToolchain({ dependencies: { wrangler: '^4.150.0' }, packuments: { wrangler: fresh } });
  assert.equal(result.choices.wrangler.chosen, '4.162.2');
  assert.equal(result.choices.wrangler.latest, '4.163.0', 'the report still names the newest release');
  assert.equal(result.choices.wrangler.heldBack, true);
  assert.equal(result.choices.wrangler.blocker.kind, 'age');
  assert.match(result.choices.wrangler.reason, /inside the release-age window/);
});
