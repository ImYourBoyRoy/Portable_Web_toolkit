// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/env.mjs
/**
 * Environment and session metadata helpers.
 *
 * Loads Web_Toolkit/project .env files, merges with process env, parses duration
 * strings, and reads/writes local Cloudflare session metadata.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, mergeEnvFiles } from '../../../shared/lib/env.mjs';
import { PORTABLE_ROOT, SESSION_META_PATH } from './paths.mjs';

export function loadDotEnv(envFilePath = path.join(PORTABLE_ROOT, '.env')) {
  return loadEnvFile(envFilePath);
}

export function mergedEnv(envFilePath = null) {
  const extraPaths = Array.isArray(envFilePath)
    ? envFilePath.filter(Boolean)
    : envFilePath
      ? [envFilePath]
      : [];
  return mergeEnvFiles(path.join(PORTABLE_ROOT, '.env'), ...extraPaths);
}

export function envValue(env, key, fallback = '') {
  const value = env?.[key];
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return String(value);
}

export function requiredEnvValue(env, key) {
  const value = envValue(env, key, '');
  if (!value) {
    throw new Error(`Missing ${key}. Set it in the project root .env or your shell environment.`);
  }
  return value;
}

export function parseDurationMs(input, fallbackMs = 24 * 60 * 60 * 1000) {
  if (input === undefined || input === null || input === '') return fallbackMs;
  const value = String(input).trim().toLowerCase();
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2] || 'h';
  if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;
  switch (unit) {
    case 'ms':
      return Math.round(amount);
    case 's':
      return Math.round(amount * 1000);
    case 'm':
      return Math.round(amount * 60_000);
    case 'h':
      return Math.round(amount * 3_600_000);
    case 'd':
      return Math.round(amount * 86_400_000);
    default:
      return fallbackMs;
  }
}

export function readSessionMeta() {
  if (!fs.existsSync(SESSION_META_PATH)) return null;
  try {
    const raw = fs.readFileSync(SESSION_META_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeSessionMeta(meta) {
  fs.mkdirSync(path.dirname(SESSION_META_PATH), { recursive: true });
  fs.writeFileSync(SESSION_META_PATH, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

export function clearSessionMeta() {
  if (fs.existsSync(SESSION_META_PATH)) {
    fs.rmSync(SESSION_META_PATH, { force: true });
  }
}

