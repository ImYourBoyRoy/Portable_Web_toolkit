// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/analytics/file-utils.mjs
/**
 * Shared file helpers for the Astro analytics scaffold flow.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ANALYTICS_ENV_KEYS } from './constants.mjs';

export function normalizeEol(value) {
  return String(value).replace(/\r\n/g, '\n');
}

export function ensureTrailingNewline(value) {
  const normalized = normalizeEol(value);
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

export function ensureParentDirectory(filePath, dryRun = false) {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function writeManagedFile(filePath, content, options = {}) {
  const { dryRun = false, force = false } = options;
  const next = ensureTrailingNewline(content);
  const exists = fs.existsSync(filePath);
  if (!exists) {
    ensureParentDirectory(filePath, dryRun);
    if (!dryRun) fs.writeFileSync(filePath, next, 'utf8');
    return { status: 'created', filePath };
  }

  const current = normalizeEol(fs.readFileSync(filePath, 'utf8'));
  if (current === normalizeEol(next)) {
    return { status: 'unchanged', filePath };
  }
  if (!force) {
    return { status: 'skipped', filePath, reason: 'exists (use --force to overwrite)' };
  }

  if (!dryRun) fs.writeFileSync(filePath, next, 'utf8');
  return { status: 'updated', filePath };
}

export function updateFileWithTransform(filePath, transform, dryRun = false) {
  if (!fs.existsSync(filePath)) {
    return { status: 'missing', filePath };
  }

  const current = normalizeEol(fs.readFileSync(filePath, 'utf8'));
  const result = transform(current);
  if (!result || typeof result !== 'object') {
    return { status: 'skipped', filePath, reason: 'no transform result' };
  }
  if (!result.changed) {
    return { status: 'unchanged', filePath, notes: result.notes || [] };
  }

  if (!dryRun) {
    fs.writeFileSync(filePath, ensureTrailingNewline(result.content), 'utf8');
  }
  return { status: 'updated', filePath, notes: result.notes || [] };
}

function serializeEnvValue(value) {
  if (value === undefined || value === null) return '';
  const raw = String(value);
  if (!raw) return '';
  if (/^[A-Za-z0-9_./:-]+$/.test(raw)) return raw;
  return JSON.stringify(raw);
}

export function upsertEnvFile(filePath, keyValues, options = {}) {
  const { dryRun = false, createIfMissing = true } = options;
  const exists = fs.existsSync(filePath);
  if (!exists && !createIfMissing) {
    return { status: 'missing', filePath };
  }

  const original = exists ? normalizeEol(fs.readFileSync(filePath, 'utf8')) : '';
  const lines = original ? original.split('\n') : [];
  const indexByKey = new Map();
  lines.forEach((line, index) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) indexByKey.set(match[1], index);
  });

  let changed = false;
  for (const [key, value] of Object.entries(keyValues)) {
    if (!ANALYTICS_ENV_KEYS.includes(key)) continue;
    const serialized = `${key}=${serializeEnvValue(value)}`;
    if (indexByKey.has(key)) {
      const idx = indexByKey.get(key);
      if (lines[idx] !== serialized) {
        lines[idx] = serialized;
        changed = true;
      }
    } else {
      if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
        lines.push('');
      }
      lines.push(serialized);
      changed = true;
    }
  }

  if (!changed) {
    return { status: exists ? 'unchanged' : 'skipped', filePath };
  }

  if (!dryRun) {
    ensureParentDirectory(filePath, false);
    fs.writeFileSync(filePath, ensureTrailingNewline(lines.join('\n')), 'utf8');
  }
  return { status: exists ? 'updated' : 'created', filePath };
}

