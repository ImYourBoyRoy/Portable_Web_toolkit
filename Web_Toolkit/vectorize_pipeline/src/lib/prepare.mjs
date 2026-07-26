// ./Web_Toolkit/vectorize_pipeline/src/lib/prepare.mjs
/**
 * Flatten / threshold rasters via Pillow before VTracer.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '../python/prepare_raster.py');

function resolvePython() {
  if (process.env.VECTORIZE_PYTHON) return process.env.VECTORIZE_PYTHON;
  if (process.env.PYTHON) return process.env.PYTHON;
  return process.platform === 'win32' ? 'py' : 'python3';
}

export function prepareRaster({
  input,
  output,
  ink = 'auto',
  threshold = true,
  thresholdValue = 160,
  scale = 1,
  blur = 0,
}) {
  mkdirSync(dirname(output), { recursive: true });
  const args = [SCRIPT, '--input', input, '--output', output, '--ink', ink, '--json'];
  if (!threshold) args.push('--no-threshold');
  if (thresholdValue != null) args.push('--threshold-value', String(thresholdValue));
  if (scale != null && Number(scale) !== 1) args.push('--scale', String(scale));
  if (blur != null && Number(blur) > 0) args.push('--blur', String(blur));

  const py = resolvePython();
  const result = spawnSync(py, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || 'prepare_raster failed').trim();
    throw new Error(
      `${err}\n(hint: needs Python 3 + Pillow + NumPy — same stack as image-pipeline)`,
    );
  }
  const line = String(result.stdout || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1);
  try {
    return JSON.parse(line);
  } catch {
    return { prepared: output, raw: line };
  }
}
