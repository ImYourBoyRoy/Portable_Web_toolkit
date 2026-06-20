// ./Web_Toolkit/Setup_astro_environment/src/lib/format.mjs
/**
 * Formatting helpers for readable terminal and JSON setup reports.
 */

export function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}

export function printSection(title) {
  console.log(`
${title}`);
}

export function printCheck(label, status, detail = '') {
  const icon = status === 'pass' ? '✅' : status === 'warn' ? '⚠' : status === 'fix' ? '🛠' : '❌';
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ''}`);
}

