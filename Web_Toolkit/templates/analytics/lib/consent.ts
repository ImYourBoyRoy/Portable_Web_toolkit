// ./Web_Toolkit/templates/analytics/lib/consent.ts
/**
 * Consent state machine for optional analytics (opt-in, default OFF).
 *
 * Pure and erasable-syntax TypeScript (no enums, namespaces or parameter properties) so Node can import it
 * directly in tests. The browser singleton at the bottom wires it to localStorage and window events.
 *
 * Public contract (documented in README.md):
 * - localStorage key   `pwt-analytics-consent`, value `{"v":1,"status":"granted"|"denied","at":<epoch ms>}`
 *   (the legacy bare strings "granted" / "denied" are still read).
 * - change event       `pwt:analytics-consent` on window, `detail: { status, previous, source }`.
 * - open request       dispatch `pwt:analytics-consent-open` on window to re-open the banner.
 * - global             `window.pwtAnalyticsConsent` { get, effective, set, reset, subscribe, refresh, open }.
 * A stored choice expires after CONSENT_MAX_AGE_DAYS so the visitor is asked again.
 * Blocked or failing storage never throws: the choice then lives in memory for the current page only.
 */

export const CONSENT_STORAGE_KEY = 'pwt-analytics-consent';
export const CONSENT_EVENT = 'pwt:analytics-consent';
export const CONSENT_OPEN_EVENT = 'pwt:analytics-consent-open';
export const CONSENT_MAX_AGE_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ConsentStatus = 'granted' | 'denied';
export type ConsentSource = 'set' | 'sync' | 'reset';

export interface ConsentDetail {
  /** The effective status after the change ("denied" when the choice was cleared). */
  status: ConsentStatus;
  /** The stored status before the change, or null when the visitor had not chosen yet. */
  previous: ConsentStatus | null;
  source: ConsentSource;
}

export interface ConsentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface StoredConsent {
  status: ConsentStatus;
  at: number | null;
}

export interface ConsentDeps {
  /** Called on every access; may return null or throw when storage is blocked. */
  getStorage: () => ConsentStorage | null;
  now?: () => number;
  /** Receives every change (the browser wiring dispatches the window event from here). */
  emit?: (detail: ConsentDetail) => void;
  maxAgeDays?: number;
}

export interface ConsentManager {
  /** The stored choice, or null when the visitor has not chosen (or the choice expired). */
  get(): ConsentStatus | null;
  /** The choice analytics must obey: "denied" until the visitor explicitly grants. */
  effective(): ConsentStatus;
  /** Persists a choice. Returns false (and does nothing) for an unknown status. */
  set(status: string): boolean;
  /** Forgets the choice; analytics fall back to denied and the banner asks again. */
  reset(): void;
  /** Re-reads storage (cross-tab changes) and notifies when the choice differs from the last seen one. */
  refresh(): void;
  subscribe(listener: (detail: ConsentDetail) => void): () => void;
  /** False when the last write could not be persisted (the choice then applies to this page only). */
  isPersisted(): boolean;
}

export function isConsentStatus(value: unknown): value is ConsentStatus {
  return value === 'granted' || value === 'denied';
}

export function serializeConsent(status: ConsentStatus, now: number): string {
  return JSON.stringify({ v: 1, status, at: now });
}

/** Parses a stored value. Returns null for anything missing, malformed, from the future or expired. */
export function parseStoredConsent(raw: string | null, now: number, maxAgeMs: number): StoredConsent | null {
  if (raw === null || raw === '') return null;
  if (isConsentStatus(raw)) return { status: raw, at: null };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { status, at } = data as { status?: unknown; at?: unknown };
  if (!isConsentStatus(status)) return null;
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  if (at > now + DAY_MS) return null;
  if (now - at > maxAgeMs) return null;
  return { status, at };
}

export function createConsentManager(deps: ConsentDeps): ConsentManager {
  const now = deps.now ?? Date.now;
  const maxAgeMs = (deps.maxAgeDays ?? CONSENT_MAX_AGE_DAYS) * DAY_MS;
  const listeners = new Set<(detail: ConsentDetail) => void>();
  let memory: StoredConsent | null = null;
  let persisted = true;

  const storage = (): ConsentStorage | null => {
    try {
      return deps.getStorage();
    } catch {
      return null;
    }
  };

  const read = (): StoredConsent | null => {
    const store = storage();
    if (store) {
      try {
        const raw = store.getItem(CONSENT_STORAGE_KEY);
        if (raw !== null) return parseStoredConsent(raw, now(), maxAgeMs);
      } catch {
        // Fall through to the in-memory choice.
      }
    }
    return memory;
  };

  let lastSeen: ConsentStatus | null = read()?.status ?? null;

  const notify = (detail: ConsentDetail): void => {
    try {
      deps.emit?.(detail);
    } catch {
      // A broken emitter must never block the choice.
    }
    for (const listener of Array.from(listeners)) {
      try {
        listener(detail);
      } catch {
        // One failing subscriber must not starve the others.
      }
    }
  };

  return {
    get: () => read()?.status ?? null,
    effective: () => read()?.status ?? 'denied',
    set(status) {
      if (!isConsentStatus(status)) return false;
      const previous = read()?.status ?? null;
      const stamp = now();
      try {
        const store = storage();
        if (!store) throw new Error('storage unavailable');
        store.setItem(CONSENT_STORAGE_KEY, serializeConsent(status, stamp));
        memory = null;
        persisted = true;
      } catch {
        memory = { status, at: stamp };
        persisted = false;
      }
      lastSeen = status;
      if (previous !== status) notify({ status, previous, source: 'set' });
      return true;
    },
    reset() {
      const previous = read()?.status ?? null;
      try {
        storage()?.removeItem?.(CONSENT_STORAGE_KEY);
      } catch {
        // Nothing else to clear.
      }
      memory = null;
      persisted = true;
      lastSeen = null;
      if (previous !== null) notify({ status: 'denied', previous, source: 'reset' });
    },
    refresh() {
      const current = read()?.status ?? null;
      if (current === lastSeen) return;
      const previous = lastSeen;
      lastSeen = current;
      notify({ status: current ?? 'denied', previous, source: 'sync' });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isPersisted: () => persisted
  };
}

export interface GrantHandlers {
  /** Runs when consent is (or becomes) granted. Must be idempotent: it can run again after a revoke. */
  grant: () => void;
  /** Runs when a previously activated provider loses consent. */
  revoke: () => void;
}

export interface WhenGrantedOptions {
  /** Used only for a choice restored from storage, to keep providers off the critical path. */
  defer?: (run: () => void) => void;
}

/** Runs a provider's handlers from the consent state. Returns an unsubscribe function. */
export function whenGranted(manager: ConsentManager, handlers: GrantHandlers, options: WhenGrantedOptions = {}): () => void {
  let active = false;
  const activate = (): void => {
    if (active) return;
    active = true;
    handlers.grant();
  };
  if (manager.get() === 'granted') {
    const restore = (): void => {
      if (manager.get() === 'granted') activate();
    };
    if (options.defer) options.defer(restore);
    else restore();
  }
  return manager.subscribe((detail) => {
    if (detail.status === 'granted') {
      activate();
    } else if (active) {
      active = false;
      handlers.revoke();
    }
  });
}

export interface BrowserConsentManager extends ConsentManager {
  /** Asks the banner to open (what the footer "Privacy choices" control does). */
  open(): void;
}

interface ConsentWindow {
  localStorage?: ConsentStorage;
  dispatchEvent?: (event: unknown) => boolean;
  addEventListener?: (type: string, listener: (event: { key?: string | null }) => void) => void;
  pwtAnalyticsConsent?: BrowserConsentManager;
}

/** The page-wide singleton. Safe to call from every component script: they all receive the same manager. */
export function getConsentManager(win: unknown = globalThis): BrowserConsentManager {
  const w = win as ConsentWindow;
  if (w.pwtAnalyticsConsent) return w.pwtAnalyticsConsent;
  const base = createConsentManager({
    getStorage: () => {
      try {
        return w.localStorage ?? null;
      } catch {
        return null;
      }
    },
    emit: (detail) => {
      w.dispatchEvent?.(new CustomEvent(CONSENT_EVENT, { detail }));
    }
  });
  const manager: BrowserConsentManager = {
    ...base,
    open: () => {
      w.dispatchEvent?.(new CustomEvent(CONSENT_OPEN_EVENT));
    }
  };
  w.pwtAnalyticsConsent = manager;
  w.addEventListener?.('storage', (event) => {
    if (event.key === null || event.key === undefined || event.key === CONSENT_STORAGE_KEY) manager.refresh();
  });
  return manager;
}
