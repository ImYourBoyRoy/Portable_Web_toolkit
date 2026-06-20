#!/usr/bin/env node
// ./Web_Toolkit/scripts/check-syntax.mjs
/**
 * Checks every toolkit .mjs file with node --check.
 *
 * Run from the toolkit root with `node ./scripts/check-syntax.mjs` or
 * `npm run check:syntax`. Inputs are source files under Web_Toolkit.
 * Outputs a concise pass/fail summary and exits non-zero on syntax errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set(['node_modules', '.runtime', 'output', 'dist', '__pycache__']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && full.endsWith('.mjs')) files.push(full);
  }
  return files;
}

const files = walk(root).sort();
const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push({
      file: path.relative(root, file).replace(/\\/g, '/'),
      stderr: result.stderr.trim()
    });
  }
}

console.log('Toolkit syntax check');
console.log(`- Files: ${files.length}`);
console.log(`- Failures: ${failures.length}`);
for (const failure of failures) {
  console.error(`${failure.file}\n${failure.stderr}`);
}
process.exitCode = failures.length > 0 ? 1 : 0;