// ./Web_Toolkit/templates/analytics/tests/consent.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_EVENT,
  CONSENT_OPEN_EVENT,
  CONSENT_STORAGE_KEY,
  createConsentManager,
  getConsentManager,
  parseStoredConsent,
  whenGranted
} from '../lib/consent.ts';
import { deferUntilIdle } from '../lib/idle.ts';

const DAY = 24 * 60 * 60 * 1000;

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key)
  };
}

function manager(storage, extra = {}) {
  const events = [];
  const clock = { now: 1_700_000_000_000 };
  const m = createConsentManager({
    getStorage: () => storage,
    now: () => clock.now,
    emit: (detail) => events.push(detail),
    ...extra
  });
  return { m, events, clock };
}

test('default is denied until the visitor chooses', () => {
  const { m, events } = manager(memoryStorage());
  assert.equal(m.get(), null);
  assert.equal(m.effective(), 'denied');
  assert.equal(events.length, 0);
});

test('set persists a versioned record and emits once per change', () => {
  const storage = memoryStorage();
  const { m, events, clock } = manager(storage);
  assert.equal(m.set('granted'), true);
  assert.deepEqual(JSON.parse(storage.getItem(CONSENT_STORAGE_KEY)), { v: 1, status: 'granted', at: clock.now });
  assert.equal(m.get(), 'granted');
  assert.equal(m.effective(), 'granted');
  assert.deepEqual(events, [{ status: 'granted', previous: null, source: 'set' }]);
  m.set('granted');
  assert.equal(events.length, 1, 'same choice does not re-emit');
  m.set('denied');
  assert.deepEqual(events[1], { status: 'denied', previous: 'granted', source: 'set' });
});

test('rejects unknown statuses without touching storage', () => {
  const storage = memoryStorage();
  const { m } = manager(storage);
  assert.equal(m.set('maybe'), false);
  assert.equal(m.set(undefined), false);
  assert.equal(storage.data.size, 0);
});

test('reads legacy bare strings and ignores junk', () => {
  assert.equal(manager(memoryStorage({ [CONSENT_STORAGE_KEY]: 'granted' })).m.get(), 'granted');
  assert.equal(manager(memoryStorage({ [CONSENT_STORAGE_KEY]: 'denied' })).m.get(), 'denied');
  for (const junk of ['yes', '{', '{"status":"granted"}', '{"status":"maybe","at":1}', '[]', 'null', '42']) {
    assert.equal(manager(memoryStorage({ [CONSENT_STORAGE_KEY]: junk })).m.get(), null, junk);
  }
});

test('a stored choice expires after the max age and from-the-future records are ignored', () => {
  const now = 1_700_000_000_000;
  const max = 180 * DAY;
  const record = (at, status = 'granted') => JSON.stringify({ v: 1, status, at });
  assert.equal(parseStoredConsent(record(now - max + DAY), now, max).status, 'granted');
  assert.equal(parseStoredConsent(record(now - max - DAY), now, max), null);
  assert.equal(parseStoredConsent(record(now + 30 * DAY), now, max), null);
  const storage = memoryStorage({ [CONSENT_STORAGE_KEY]: record(now) });
  const { m, clock } = manager(storage);
  assert.equal(m.get(), 'granted');
  clock.now += 181 * DAY;
  assert.equal(m.get(), null);
  assert.equal(m.effective(), 'denied');
});

test('blocked storage (null, throwing getter, throwing methods) never throws and keeps the choice in memory', () => {
  for (const getStorage of [
    () => null,
    () => {
      throw new Error('SecurityError');
    },
    () => ({
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      }
    })
  ]) {
    const events = [];
    const m = createConsentManager({ getStorage, emit: (d) => events.push(d) });
    assert.equal(m.get(), null);
    assert.equal(m.set('granted'), true);
    assert.equal(m.get(), 'granted');
    assert.equal(m.isPersisted(), false);
    assert.equal(events.length, 1);
    m.reset();
    assert.equal(m.get(), null);
  }
});

test('reset clears the choice and reports denied', () => {
  const storage = memoryStorage();
  const { m, events } = manager(storage);
  m.set('granted');
  m.reset();
  assert.equal(storage.getItem(CONSENT_STORAGE_KEY), null);
  assert.equal(m.get(), null);
  assert.deepEqual(events.at(-1), { status: 'denied', previous: 'granted', source: 'reset' });
});

test('refresh picks up cross-tab changes once', () => {
  const storage = memoryStorage();
  const { m, events } = manager(storage);
  storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, status: 'granted', at: 1_700_000_000_000 }));
  m.refresh();
  m.refresh();
  assert.deepEqual(events, [{ status: 'granted', previous: null, source: 'sync' }]);
  storage.removeItem(CONSENT_STORAGE_KEY);
  m.refresh();
  assert.deepEqual(events.at(-1), { status: 'denied', previous: 'granted', source: 'sync' });
});

test('a throwing subscriber or emitter does not block others', () => {
  const { m } = manager(memoryStorage(), {
    emit: () => {
      throw new Error('emitter');
    }
  });
  const seen = [];
  m.subscribe(() => {
    throw new Error('listener');
  });
  m.subscribe((d) => seen.push(d.status));
  m.set('granted');
  assert.deepEqual(seen, ['granted']);
});

test('unsubscribe stops notifications', () => {
  const { m } = manager(memoryStorage());
  const seen = [];
  const off = m.subscribe((d) => seen.push(d.status));
  m.set('granted');
  off();
  m.set('denied');
  assert.deepEqual(seen, ['granted']);
});

test('whenGranted: nothing runs without consent, grant on opt-in, revoke only after activation', () => {
  const { m } = manager(memoryStorage());
  const calls = [];
  whenGranted(m, { grant: () => calls.push('grant'), revoke: () => calls.push('revoke') });
  assert.deepEqual(calls, []);
  m.set('denied');
  assert.deepEqual(calls, [], 'denying before activation does not call revoke');
  m.set('granted');
  m.set('denied');
  m.set('granted');
  assert.deepEqual(calls, ['grant', 'revoke', 'grant']);
});

test('whenGranted: a restored choice is deferred, and a revoke before the deferred run cancels it', () => {
  const storage = memoryStorage({ [CONSENT_STORAGE_KEY]: 'granted' });
  const { m } = manager(storage);
  const calls = [];
  let queued;
  whenGranted(m, { grant: () => calls.push('grant'), revoke: () => calls.push('revoke') }, { defer: (run) => (queued = run) });
  assert.deepEqual(calls, []);
  m.set('denied');
  queued();
  assert.deepEqual(calls, [], 'denied before the deferred run: provider never starts');

  const second = manager(memoryStorage({ [CONSENT_STORAGE_KEY]: 'granted' })).m;
  const calls2 = [];
  let queued2;
  whenGranted(second, { grant: () => calls2.push('grant'), revoke: () => calls2.push('revoke') }, { defer: (run) => (queued2 = run) });
  queued2();
  assert.deepEqual(calls2, ['grant']);
});

test('browser singleton: one manager per window, dispatches the documented events, open() asks for the banner', () => {
  const storage = memoryStorage();
  const dispatched = [];
  const listeners = {};
  const win = {
    localStorage: storage,
    dispatchEvent: (event) => dispatched.push(event),
    addEventListener: (type, fn) => (listeners[type] = fn)
  };
  const a = getConsentManager(win);
  assert.equal(getConsentManager(win), a);
  assert.equal(win.pwtAnalyticsConsent, a);
  a.set('granted');
  assert.equal(dispatched[0].type, CONSENT_EVENT);
  assert.deepEqual({ ...dispatched[0].detail }, { status: 'granted', previous: null, source: 'set' });
  a.open();
  assert.equal(dispatched[1].type, CONSENT_OPEN_EVENT);

  storage.removeItem(CONSENT_STORAGE_KEY);
  listeners.storage({ key: 'unrelated' });
  assert.equal(dispatched.length, 2, 'unrelated storage keys are ignored');
  listeners.storage({ key: CONSENT_STORAGE_KEY });
  assert.equal(dispatched.length, 3);
  assert.equal(dispatched[2].detail.source, 'sync');
});

test('browser singleton survives a window whose localStorage getter throws', () => {
  const win = {
    get localStorage() {
      throw new Error('SecurityError');
    }
  };
  const m = getConsentManager(win);
  assert.equal(m.effective(), 'denied');
  assert.equal(m.set('granted'), true);
  assert.equal(m.get(), 'granted');
});

test('deferUntilIdle waits for load, then uses requestIdleCallback or a timeout', () => {
  const ran = [];
  let loadHandler;
  const idle = [];
  deferUntilIdle(() => ran.push('a'), {
    document: { readyState: 'loading' },
    addEventListener: (_t, fn) => (loadHandler = fn),
    requestIdleCallback: (cb, opts) => idle.push([cb, opts]),
    setTimeout: () => assert.fail('should use idle callback')
  });
  assert.equal(idle.length, 0);
  loadHandler();
  assert.equal(idle[0][1].timeout, 3000);
  idle[0][0]();
  assert.deepEqual(ran, ['a']);

  const timers = [];
  deferUntilIdle(() => ran.push('b'), { document: { readyState: 'complete' }, setTimeout: (cb, ms) => timers.push([cb, ms]) });
  assert.equal(timers[0][1], 250);
  timers[0][0]();
  assert.deepEqual(ran, ['a', 'b']);
});
