// ./Web_Toolkit/vectorize_pipeline/src/lib/vtracer.mjs
/**
 * Locate and invoke the VTracer binary.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.VTRACER_PATH,
  'vtracer',
  join(homedir(), '.cargo', 'bin', 'vtracer'),
  '/usr/local/bin/vtracer',
  '/usr/bin/vtracer',
].filter(Boolean);

export function findVtracer() {
  for (const candidate of CANDIDATES) {
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', [candidate], {
      encoding: 'utf8',
    });
    if (which.status === 0) {
      const line = String(which.stdout || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean);
      if (line) return line;
    }
  }
  return null;
}

export function runVtracer({ bin, input, output, preset, overrides = {} }) {
  const args = ['--input', input, '--output', output];

  if (preset.vtracerPreset) {
    args.push('--preset', preset.vtracerPreset);
  } else {
    if (preset.colormode) args.push('--colormode', String(preset.colormode));
    if (preset.mode) args.push('--mode', String(preset.mode));
    if (preset.filter_speckle != null) args.push('--filter_speckle', String(preset.filter_speckle));
    if (preset.color_precision != null) args.push('--color_precision', String(preset.color_precision));
    if (preset.corner_threshold != null) args.push('--corner_threshold', String(preset.corner_threshold));
    if (preset.segment_length != null) args.push('--segment_length', String(preset.segment_length));
    if (preset.splice_threshold != null) args.push('--splice_threshold', String(preset.splice_threshold));
    if (preset.path_precision != null) args.push('--path_precision', String(preset.path_precision));
    if (preset.gradient_step != null) args.push('--gradient_step', String(preset.gradient_step));
    if (preset.hierarchical) args.push('--hierarchical', String(preset.hierarchical));
  }

  // CLI overrides win
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null || value === false) continue;
    args.push(`--${key}`, String(value));
  }

  const result = spawnSync(bin, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || 'vtracer failed').trim();
    throw new Error(err);
  }
  return { args, stdout: result.stdout };
}
