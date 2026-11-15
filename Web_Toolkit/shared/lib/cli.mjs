// ./Web_Toolkit/shared/lib/cli.mjs
/**
 * Shared CLI argument parser for portable toolkit tools.
 *
 * Behavior:
 * - `--key=value` is always a value (including an empty value).
 * - `--key value` consumes the next token only when `key` is not a boolean flag.
 * - Boolean flags never swallow the following token, so `tool --skip-x run` keeps
 *   `run` as the command instead of silently turning into `help` (exit 0).
 * - `--` ends flag parsing; everything after it is returned in `rest`.
 *
 * Boolean detection: `options.booleanFlags` plus the toolkit-wide defaults below
 * (`skip-*`, `no-*`, and the documented switches). A tool with an unusual switch
 * should pass it via `parseCliArgs(argv, { booleanFlags: ['my-switch'] })`.
 *
 * Output: `{ command: string[], flags: Record<string, string|true>, rest: string[] }`.
 */

export const DEFAULT_BOOLEAN_FLAGS = Object.freeze(new Set([
  'aggressive', 'allow-loopback', 'stale-only', 'apply', 'apply-safe-fixes', 'browser-lighthouse', 'browser-screenshots',
  'build', 'cloudflare', 'cleanup-dns', 'create-missing', 'current-color', 'debug', 'dry-run', 'force', 'from-profile',
  'headed', 'help', 'include-assets', 'install-deps', 'json', 'keep-prep', 'lighthouse',
  'manage-server', 'offline', 'pagespeed', 'quiet', 'replace-references', 'require-llms',
  'require-llms-full', 'screenshots', 'strict', 'update-engine', 'verbose', 'version', 'wcag', 'wcag-from-profile', 'wcag-manage-server',
  'yes'
]));

const BOOLEAN_PREFIXES = ['skip-', 'no-'];

export function isBooleanFlag(name, extra = []) {
  const key = String(name);
  if (DEFAULT_BOOLEAN_FLAGS.has(key)) return true;
  if (BOOLEAN_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
  return Array.isArray(extra) ? extra.includes(key) : Boolean(extra?.has?.(key));
}

export function parseCliArgs(argv = [], options = {}) {
  const command = [];
  const flags = {};
  const rest = [];
  const booleanFlags = options.booleanFlags || [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] ?? '');

    if (token === '--') {
      rest.push(...argv.slice(index + 1).map(String));
      break;
    }
    if (!token.startsWith('--')) {
      command.push(token);
      continue;
    }

    const trimmed = token.slice(2);
    const eq = trimmed.indexOf('=');
    if (eq >= 0) {
      flags[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
      continue;
    }

    const next = argv[index + 1];
    if (!isBooleanFlag(trimmed, booleanFlags) && next !== undefined && !String(next).startsWith('--')) {
      flags[trimmed] = String(next);
      index += 1;
    } else {
      flags[trimmed] = true;
    }
  }

  return { command, flags, rest };
}

export function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}
