import { createHash, randomUUID } from 'node:crypto';

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function stableHash(value) {
  const serialized = typeof value === 'string' ? value : stableStringify(value);
  return createHash('sha256').update(serialized).digest('hex');
}

export function createRunId(now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, '');
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}
