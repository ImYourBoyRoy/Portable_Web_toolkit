// ./Web_Toolkit/templates/contact/scripts/form-draft.ts
/**
 * Form draft storage: versioned key, expiry, an excluded-field list and "clear on confirmed success".
 * Pure core with injectable storage and clock (erasable-syntax TypeScript, no DOM), so Node tests can import it.
 * The DOM wiring lives in ContactForm.astro (or scripts/intake-form.ts for multi-section forms). Copy to: src/scripts/form-draft.ts
 * Rules: a draft is saved while typing (debounced by the caller), never includes excluded fields, expires after
 * `ttlMs`, and is removed only by `clear()`. The caller calls `clear()` after a real server success and on the
 * visitor's explicit "Clear saved draft" action, never on a failed send.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DraftOptions {
  key: string;
  version: number;
  ttlMs: number;
  /** Field names that must never be written to the draft (links, files, secrets, plumbing). */
  excluded: readonly string[];
  storage: StorageLike | null;
  now?: () => number;
}

export type DraftValues = Record<string, string | string[]>;

export interface Draft {
  savedAt: number;
  values: DraftValues;
}

export interface DraftStore {
  available: boolean;
  save(values: DraftValues): boolean;
  load(): Draft | null;
  clear(): void;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Keeps only plain string values for allowed names. Empty values are dropped so an empty form stores nothing. */
export function filterDraftValues(values: DraftValues, excluded: readonly string[]): DraftValues {
  const blocked = new Set(excluded);
  const out: DraftValues = {};
  for (const [name, value] of Object.entries(values)) {
    if (blocked.has(name)) continue;
    if (Array.isArray(value)) {
      const items = value.filter((item) => typeof item === 'string' && item !== '');
      if (items.length > 0) out[name] = items;
    } else if (typeof value === 'string' && value.trim() !== '') {
      out[name] = value;
    }
  }
  return out;
}

export function createDraftStore(options: DraftOptions): DraftStore {
  const now = options.now ?? Date.now;
  const storage = options.storage;
  const key = `${options.key}:v${options.version}`;

  return {
    available: storage !== null,
    save(values) {
      if (!storage) return false;
      const filtered = filterDraftValues(values, options.excluded);
      try {
        if (Object.keys(filtered).length === 0) {
          storage.removeItem(key);
          return true;
        }
        storage.setItem(key, JSON.stringify({ v: options.version, savedAt: now(), values: filtered }));
        return true;
      } catch {
        // Quota exceeded or storage blocked: the form keeps working, it just does not remember.
        return false;
      }
    },
    load() {
      if (!storage) return null;
      let raw: string | null;
      try {
        raw = storage.getItem(key);
      } catch {
        return null;
      }
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as { v?: unknown; savedAt?: unknown; values?: unknown };
        const valid =
          parsed &&
          parsed.v === options.version &&
          typeof parsed.savedAt === 'number' &&
          parsed.values !== null &&
          typeof parsed.values === 'object' &&
          !Array.isArray(parsed.values);
        if (!valid || now() - (parsed.savedAt as number) > options.ttlMs || (parsed.savedAt as number) > now() + DAY_MS) {
          storage.removeItem(key);
          return null;
        }
        const values = filterDraftValues(parsed.values as DraftValues, options.excluded);
        if (Object.keys(values).length === 0) {
          storage.removeItem(key);
          return null;
        }
        return { savedAt: parsed.savedAt as number, values };
      } catch {
        try {
          storage.removeItem(key);
        } catch {
          // ignore
        }
        return null;
      }
    },
    clear() {
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch {
        // ignore
      }
    }
  };
}

/* ------------------------------------------------- Fallback and ids (pure) */

/** Short id the visitor can quote. 12 base-36 characters from Web Crypto, with a readable prefix. */
export function createSubmissionId(prefix = 'inq'): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)}`;
}

export interface MailtoInput {
  address: string;
  subject: string;
  /** Ordered [label, value] pairs. Empty values are skipped. */
  rows: ReadonlyArray<readonly [string, string]>;
  intro?: string;
  /** Browsers and mail apps truncate long mailto links; the body is cut at this many characters. */
  maxBodyChars?: number;
}

export function buildMailtoHref(input: MailtoInput): string {
  const max = input.maxBodyChars ?? 1800;
  const lines = input.intro ? [input.intro, ''] : [];
  for (const [label, value] of input.rows) {
    if (value.trim() !== '') lines.push(`${label}: ${value.trim()}`);
  }
  let body = lines.join('\n');
  if (body.length > max) body = `${body.slice(0, max).replace(/\s+\S*$/, '')}\n\n[Shortened: the full text is still in the form.]`;
  return `mailto:${input.address}?subject=${encodeURIComponent(input.subject)}&body=${encodeURIComponent(body)}`;
}
