// ./src/commands/setup-env.mjs
/**
 * setup-env command: bootstrapping the Python environment.
 * Prioritizes pyenv-native for managed environments.
 */

import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { resolveBrandDoctorPython } from '../lib/env.mjs';
import { resolveProjectRoot, TOOL_ROOT } from '../lib/paths.mjs';

const MANAGED_VENV_NAME = 'brand-doctor';

export async function runSetupEnv(options = {}) {
  const projectRoot = resolveProjectRoot(options);
  const requestedPython = options.python; // --python <path>
  console.log(`\x1b[36m[brand-doctor]\x1b[0m Setting up Python environment...`);

  let resolvedExec = null;

  // 1. Detect pyenv-native
  const hasPyenv = isCommandAvailable('pyenv');

  if (hasPyenv && !requestedPython) {
    console.log(`\x1b[32m[pyenv-native]\x1b[0m Detected pyenv-native. Preferring managed venv...`);
    
    // Check if brand-doctor venv exists
    const venvList = spawnSync('pyenv', ['venv', 'list'], { encoding: 'utf8' }).stdout || '';
    if (!venvList.includes(MANAGED_VENV_NAME)) {
      console.log(`\x1b[33m[setup-env]\x1b[0m Fetching active python version...`);
      const vName = spawnSync('pyenv', ['version-name'], { encoding: 'utf8' }).stdout.trim();
      
      console.log(`\x1b[33m[setup-env]\x1b[0m Creating managed venv '${MANAGED_VENV_NAME}' using ${vName}...`);
      spawnSync('pyenv', ['venv', 'create', vName, MANAGED_VENV_NAME], { stdio: 'inherit' });
    }

    // Bind project to this venv
    console.log(`\x1b[33m[setup-env]\x1b[0m Binding project to managed venv...`);
    spawnSync('pyenv', ['venv', 'use', MANAGED_VENV_NAME], { cwd: projectRoot, stdio: 'inherit' });
    
    // Resolve it to verify
    resolvedExec = resolveBrandDoctorPython(projectRoot);
  } else {
    // Fallback to local .venv or explicit python
    const basePython = requestedPython || 'python';
    const venvPath = path.join(projectRoot, '.venv');

    if (!fs.existsSync(venvPath)) {
      console.log(`\x1b[33m[setup-env]\x1b[0m Creating local .venv using ${basePython}...`);
      const result = spawnSync(basePython, ['-m', 'venv', '.venv'], { stdio: 'inherit' });
      if (result.status !== 0) {
        throw new Error(`Failed to create venv using ${basePython}. Ensure Python is installed.`);
      }
    }
    resolvedExec = resolveBrandDoctorPython(projectRoot);
  }

  if (!resolvedExec) {
    throw new Error("Could not resolve Python interpreter after setup.");
  }

  // Install dependencies
  console.log(`\x1b[33m[setup-env]\x1b[0m Installing dependencies (Pillow, CairoSVG, fonttools, brotli) into ${resolvedExec}...`);
  const pipResult = spawnSync(resolvedExec, ['-m', 'pip', 'install', 'Pillow', 'CairoSVG', 'fonttools', 'brotli'], { 
    stdio: 'inherit'
  });

  if (pipResult.status !== 0) {
    throw new Error("Failed to install Python dependencies.");
  }

  console.log(`\x1b[32m[SUCCESS]\x1b[0m Environment ready.`);
  console.log(`\x1b[36mInterpreter:\x1b[0m ${resolvedExec}`);
  console.log(`\x1b[36mContext:\x1b[1m ${projectRoot}\x1b[0m`);

  // Cleanup legacy .python-version if it exists in the toolkit folder
  const legacyVersionFile = path.join(TOOL_ROOT, '.python-version');
  if (fs.existsSync(legacyVersionFile) && projectRoot !== TOOL_ROOT) {
    console.log(`\x1b[33m[cleanup]\x1b[0m Removing legacy .python-version from toolkit folder...`);
    fs.unlinkSync(legacyVersionFile);
  }
  
  return resolvedExec;
}

function isCommandAvailable(cmd) {
  try {
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? 'where' : 'which';
    const result = spawnSync(checkCmd, [cmd], { encoding: 'utf8' });
    return result.status === 0;
  } catch (err) {
    return false;
  }
}
