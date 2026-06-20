// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/format.mjs
/**
 * Formatting and small utility helpers.
 *
 * Provides UTC timestamp generation, JSON pretty-printing, and safe parsing
 * helpers used by command modules.
 */

export function utcStamp() {
  return new Date().toISOString().replaceAll(':', '-');
}

export function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function asString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value);
}


