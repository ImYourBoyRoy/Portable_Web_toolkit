// ./Web_Toolkit/image_pipeline/src/lib/python.mjs
/**
 * Python helper bridge for image inspection and lossless WebP conversion.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { TOOL_ROOT } from './paths.mjs';

function runPython(args = [], cwd = process.cwd()) {
  const scriptPath = path.join(TOOL_ROOT, 'src', 'python', 'image_pipeline.py');
  let result = spawnSync('python', [scriptPath, ...args], {
    cwd,
    encoding: 'utf8'
  });

  // Self-healing check: if Pillow is missing, try to install it
  if (result.status !== 0 && result.stderr && result.stderr.includes("ModuleNotFoundError: No module named 'PIL'")) {
    throw new Error(
      'Pillow is missing. Run `brand-doctor setup-env` or `python -m pip install Pillow` in the intended project environment before using image-pipeline.'
    );
  }

  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || '')
  };
}

export function inspectImage(filePath, cwd) {
  const result = runPython(['inspect', '--path', filePath], cwd);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `Failed to inspect ${filePath}`);
  }
  return JSON.parse(result.stdout);
}

export function convertToWebp(inputPath, outputPath, cwd) {
  const result = runPython(['convert-webp', '--input', inputPath, '--output', outputPath], cwd);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `Failed to convert ${inputPath}`);
  }
  return JSON.parse(result.stdout);
}

/**
 * Optional AVIF conversion. Requires Pillow with AVIF support (or pillow-avif-plugin).
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {string} cwd
 * @param {{ quality?: number }} [options]
 */
export function convertToAvif(inputPath, outputPath, cwd, options = {}) {
  const quality = Number(options.quality || 55);
  const result = runPython(
    ['convert-avif', '--input', inputPath, '--output', outputPath, '--quality', String(quality)],
    cwd
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `Failed to convert ${inputPath} to AVIF`);
  }
  return JSON.parse(result.stdout);
}

