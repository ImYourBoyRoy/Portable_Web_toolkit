// ./src/lib/env.mjs
/**
 * Python Environment & Runtime Management for Brand Doctor.
 * Handles prioritized interpreter resolution and Enchi integration (formerly pyenv-native).
 * 
 * resolution order:
 * 1. BRAND_DOCTOR_PYTHON env var
 * 2. active Enchi selected interpreter
 * 3. project-root .venv
 * 4. system python3
 * 5. system python
 */

import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Resolves the best Python interpreter based on the prioritized strategy.
 * @param {string} projectRoot - The root of the project to check for .venv or pyenv.
 * @returns {string|null} Resolved path to the Python executable.
 */
export function resolveBrandDoctorPython(projectRoot) {
  // 1. BRAND_DOCTOR_PYTHON env var
  if (process.env.BRAND_DOCTOR_PYTHON) {
    if (fs.existsSync(process.env.BRAND_DOCTOR_PYTHON)) {
      return process.env.BRAND_DOCTOR_PYTHON;
    }
  }

  // 2. active Enchi selected interpreter
  const pyenvPython = findPyenvNativePython(projectRoot);
  if (pyenvPython) return pyenvPython;

  // 3. project-root .venv
  const localVenv = findLocalVenvPython(projectRoot);
  if (localVenv) return localVenv;

  // 4. system python3
  const py3 = which('python3');
  if (py3) return py3;

  // 5. system python
  const py = which('python');
  if (py) return py;

  return null;
}

/**
 * The Enchi CLI (formerly pyenv-native, renamed in 0.8.0): `enchi`, or `pyenv` on a machine that has not upgraded yet.
 * Returns '' when neither runs.
 */
export function enchiCommand() {
  for (const name of ['enchi', 'pyenv']) {
    const probe = spawnSync(name, ['--version'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0) return name;
  }
  return '';
}

/**
 * Queries Enchi for the active interpreter path.
 */
function findPyenvNativePython(projectRoot) {
  try {
    const enchi = enchiCommand();
    if (!enchi) return null;
    // We run 'enchi prefix' within the project root to respect local selection
    const result = spawnSync(enchi, ['prefix'], { 
      cwd: projectRoot, 
      encoding: 'utf8' 
    });

    if (result.status === 0 && result.stdout.trim()) {
      const prefix = result.stdout.trim();
      const isWin = process.platform === 'win32';
      let execPath = isWin 
        ? path.join(prefix, 'python.exe') 
        : path.join(prefix, 'bin', 'python');
      
      if (isWin && !fs.existsSync(execPath)) {
        // Venvs on Windows put scripts in 'Scripts'
        execPath = path.join(prefix, 'Scripts', 'python.exe');
      }
      
      if (fs.existsSync(execPath)) {
        return execPath;
      }
    }
  } catch (err) {
    // Enchi not found or failed
  }
  return null;
}

/**
 * Checks for a project-root .venv
 */
function findLocalVenvPython(projectRoot) {
  const isWin = process.platform === 'win32';
  const execPath = isWin
    ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, '.venv', 'bin', 'python');
  
  if (fs.existsSync(execPath)) {
    return execPath;
  }
  return null;
}

/**
 * Simple 'which' implementation
 */
function which(cmd) {
  try {
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? 'where' : 'which';
    const result = spawnSync(checkCmd, [cmd], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) {
      // 'where' might return multiple lines, take the first
      return result.stdout.trim().split('\r\n')[0].split('\n')[0];
    }
  } catch (err) {}
  return null;
}

/**
 * Checks if the resolved environment has the required dependencies.
 */
export function auditPythonEnv(pythonPath) {
  const result = spawnSync(pythonPath, ['-c', 'import PIL; import cairosvg; print("OK")'], {
    encoding: 'utf8'
  });
  
  return {
    path: pythonPath,
    available: !!pythonPath,
    deps: result.status === 0,
    error: result.status !== 0 ? result.stderr || result.stdout : null
  };
}
