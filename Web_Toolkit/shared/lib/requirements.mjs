// ./Web_Toolkit/shared/lib/requirements.mjs
/**
 * Shared requirements and dependency auditing.
 */

import { spawnSync } from 'node:child_process';

/**
 * Check if a command exists and returns a zero exit code.
 */
export function checkCommand(cmd, args = []) {
  try {
    const result = spawnSync(cmd, args, { encoding: 'utf8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Perform a standard environment audit for brand/image tools.
 */
export function auditImageRequirements() {
  const results = {
    node: { pass: true, version: process.version },
    python: { pass: false, version: null, error: null },
    pillow: { pass: false, version: null, error: null }
  };

  // Python check
  try {
    const py = spawnSync('python', ['--version'], { encoding: 'utf8' });
    if (py.status === 0) {
      results.python.pass = true;
      results.python.version = py.stdout.trim() || py.stderr.trim();
    } else {
      results.python.error = 'Python not found or returned error code.';
    }
  } catch (e) {
    results.python.error = e.message;
  }

  // Pillow check
  if (results.python.pass) {
    try {
      const pil = spawnSync('python', ['-c', 'import PIL; print(PIL.__version__)'], { encoding: 'utf8' });
      if (pil.status === 0) {
        results.pillow.pass = true;
        results.pillow.version = pil.stdout.trim();
      } else {
        results.pillow.error = 'Pillow (PIL) not installed in Python environment.';
      }
    } catch (e) {
      results.pillow.error = e.message;
    }
  }

  return results;
}

/**
 * Print a pretty requirement report and return true if everything passes.
 */
export function printRequirementReport(results) {
  console.log('\nEnvironment audit:');
  let allPass = true;
  for (const [name, data] of Object.entries(results)) {
    const status = data.pass ? '✓' : '✗';
    console.log(`- ${name.padEnd(8)} [${status}] ${data.version || data.error || 'Unknown'}`);
    if (!data.pass) allPass = false;
  }
  return allPass;
}

