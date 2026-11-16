// form-draft: versioned key, expiry, excluded fields, clear-on-success helper contract, mailto fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, buildMailtoHref, createDraftStore, createSubmissionId, filterDraftValues } from '../scripts/form-draft.ts';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k), map };
}

test('draft: saves allowed fields only, restores them, and clears', () => {
  const storage = memoryStorage();
  let now = 1_000_000;
  const store = createDraftStore({ key: 'k', version: 1, ttlMs: 7 * DAY_MS, excluded: ['assets', 'inspiration'], storage, now: () => now });
  assert.equal(store.save({ name: 'Ada', goal: 'Hi', inspiration: 'https://secret.example', assets: ['bio'], note: '  ' }), true);
  const raw = [...storage.map.values()][0];
  assert.ok(!raw.includes('secret.example') && !raw.includes('bio'));
  assert.deepEqual(store.load().values, { name: 'Ada', goal: 'Hi' });
  store.clear();
  assert.equal(store.load(), null);
});

test('draft: expires after the TTL and rejects other versions and corrupt data', () => {
  const storage = memoryStorage();
  let now = 1_000_000;
  const options = { key: 'k', version: 1, ttlMs: 7 * DAY_MS, excluded: [], storage, now: () => now };
  const store = createDraftStore(options);
  store.save({ name: 'Ada' });
  now += 7 * DAY_MS - 1000;
  assert.ok(store.load());
  now += 2000;
  assert.equal(store.load(), null);
  assert.equal(storage.map.size, 0, 'expired drafts are removed');

  store.save({ name: 'Ada' });
  assert.equal(createDraftStore({ ...options, version: 2 }).load(), null, 'a new version ignores the old key');
  const key = [...storage.map.keys()][0];
  storage.map.set(key, '{not json');
  assert.equal(store.load(), null);
  storage.map.set(key, JSON.stringify({ v: 1, savedAt: now + 40 * DAY_MS, values: { name: 'x' } }));
  assert.equal(store.load(), null, 'future timestamps are rejected');
});

test('draft: unavailable or throwing storage never breaks the form', () => {
  assert.equal(createDraftStore({ key: 'k', version: 1, ttlMs: 1, excluded: [], storage: null }).save({ a: 'b' }), false);
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
  const store = createDraftStore({ key: 'k', version: 1, ttlMs: 1, excluded: [], storage: throwing });
  assert.equal(store.save({ a: 'b' }), false);
  assert.equal(store.load(), null);
  assert.doesNotThrow(() => store.clear());
  assert.deepEqual(filterDraftValues({ a: '', b: ['', 'x'], c: 'y' }, []), { b: ['x'], c: 'y' });
});

test('mailto fallback carries the entered content, id in the subject, and is length capped', () => {
  const href = buildMailtoHref({ address: 'a@example.com', subject: 'Inquiry inq-1', intro: 'Reference: inq-1', rows: [['Name', 'Ada'], ['Goal', 'Build & grow'], ['Empty', ' ']] });
  assert.ok(href.startsWith('mailto:a@example.com?subject=Inquiry%20inq-1&body='));
  const body = decodeURIComponent(href.split('body=')[1]);
  assert.match(body, /Name: Ada\nGoal: Build & grow/);
  assert.ok(!body.includes('Empty'));
  const long = decodeURIComponent(buildMailtoHref({ address: 'a@example.com', subject: 's', rows: [['Goal', 'word '.repeat(2000)]] }).split('body=')[1]);
  assert.ok(long.length < 2000 && long.includes('Shortened'));
  assert.match(createSubmissionId(), /^inq-[a-z0-9]{12}$/);
});
