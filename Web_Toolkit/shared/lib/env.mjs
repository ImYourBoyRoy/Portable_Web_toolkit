// ./Web_Toolkit/shared/lib/env.mjs
/**
 * Shared .env parsing and merge helpers for the portable toolkit.
 */

import fs from 'node:fs';

export function parseEnvLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const index = trimmed.indexOf('=');
  if (index < 0) return null;
  const key = trimmed.slice(0, index).trim();
  if (!key) return null;
  let value = trimmed.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

export function loadEnvFile(envPath) {
  const values = {};
  if (!envPath || !fs.existsSync(envPath)) return values;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    values[key] = value;
  }
  return values;
}

export function mergeEnvFiles(...envPaths) {
  const merged = {};
  for (const current of envPaths.flat().filter(Boolean)) {
    Object.assign(merged, loadEnvFile(current));
  }
  return { ...merged, ...process.env };
}

