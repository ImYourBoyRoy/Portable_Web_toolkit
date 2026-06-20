// ./Web_Toolkit/brand_doctor/src/lib/python.mjs
/**
 * Python bridge for brand asset inspection and generation.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { TOOL_ROOT } from './paths.mjs';
import { resolveBrandDoctorPython } from './env.mjs';

function runPython(args = [], input = null, cwd = process.cwd()) {
  const pythonPath = resolveBrandDoctorPython(cwd) || 'python';
  const scriptPath = path.join(TOOL_ROOT, 'src', 'python', 'brand_assets.py');
  
  if (input) {
    console.log(`[python] Executing: ${pythonPath} "${scriptPath}" ${args.join(' ')} (with stdin payload)`);
  } else {
    console.log(`[python] Executing: ${pythonPath} "${scriptPath}" ${args.join(' ')}`);
  }

  const result = spawnSync(pythonPath, [scriptPath, ...args], {
    cwd,
    input,
    encoding: 'utf8'
  });

  if (result.stderr && result.status !== 0) {
    console.error(`[python stderr] ${result.stderr}`);
  }

  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || '')
  };
}

function parse(result, errorLabel) {
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || errorLabel);
  }
  return JSON.parse(result.stdout);
}

export function inspectImage(filePath, cwd) {
  return parse(runPython(['inspect', '--path', filePath], cwd), `Failed to inspect ${filePath}`);
}

export function generateOg(spec, projectRoot) {
  const result = runPython(['generate-og', '--spec-json', '-'], JSON.stringify(spec), projectRoot);
  if (result.status !== 0) {
    console.error(`[FAILED] (status ${result.status})`);
    if (result.stdout) console.error(`[stdout] ${result.stdout}`);
    if (result.stderr) console.error(`[stderr] ${result.stderr}`);
    throw new Error('generate-og failed');
  }
  return JSON.parse(result.stdout);
}

export function generateIcons(spec, projectRoot) {
  const result = runPython(['generate-icons', '--spec-json', '-'], JSON.stringify(spec), projectRoot);
  if (result.status !== 0) {
    console.error(`[FAILED] (status ${result.status})`);
    if (result.stdout) console.error(`[stdout] ${result.stdout}`);
    if (result.stderr) console.error(`[stderr] ${result.stderr}`);
    throw new Error('generate-icons failed');
  }
  return JSON.parse(result.stdout);
}

export function rewritePng(inputPath, outputPath, cwd) {
  return parse(runPython(['rewrite-png', '--input', inputPath, '--output', outputPath], cwd), 'Failed to rewrite PNG asset');
}

export function generateIco(inputPath, outputPath, cwd) {
  return parse(runPython(['generate-ico', '--input', inputPath, '--output', outputPath], cwd), 'Failed to generate ICO asset');
}

