// ./Web_Toolkit/toolkit_purge/src/lib/targets.mjs
/**
 * Target discovery and safe removal for toolkit-purge.
 *
 * Purpose: find generated runtime artifacts under a portable-toolkit root and
 * delete them without ever following a symlink or leaving that root.
 * Run: imported by ../../bin/toolkit-purge.mjs and the root test suite.
 * Inputs: an absolute portable root directory.
 * Outputs: sorted absolute target paths; removal results.
 * Side effects: removeTarget deletes files/directories (callers gate on --apply).
 * Notes: symlinks are never traversed, listed, or deleted through; vendored
 * dependency trees (node_modules, .git) are never scanned.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Directory names that are never descended into while scanning. */
export const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);

/** Generated directory names removed wherever they appear. */
const GENERATED_DIRECTORY_NAMES = new Set(['.runtime', '.cf-agent', '__pycache__', '.pytest_cache']);

function toPosix(value) {
  return value.replace(/\\/g, '/');
}

/**
 * Breadth-first walk that uses lstat so symlinks are neither followed nor matched.
 * Matched directories are not descended into.
 */
export function walk(root, predicate) {
  const matches = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink()) continue;
    if (predicate(current, stat)) {
      matches.push(current);
      if (stat.isDirectory()) continue;
    }
    if (stat.isDirectory()) {
      if (current !== root && SKIPPED_DIRECTORIES.has(path.basename(current))) continue;
      for (const entry of fs.readdirSync(current)) {
        queue.push(path.join(current, entry));
      }
    }
  }
  return matches;
}

export function isGeneratedDirectory(current, stat, portableRoot) {
  if (!stat.isDirectory()) return false;
  const name = path.basename(current);
  if (GENERATED_DIRECTORY_NAMES.has(name)) return true;
  if (name === 'output' || name === 'dist') {
    const parent = path.dirname(current);
    if (path.resolve(parent) === path.resolve(portableRoot)) return true;
    const parentName = path.basename(parent);
    // Only direct children of a tool folder (e.g. site_doctor/output), never
    // dot-folders, source folders, or vendored dependencies.
    const grandparent = path.dirname(parent);
    return (
      path.resolve(grandparent) === path.resolve(portableRoot) &&
      !parentName.startsWith('.') &&
      !['node_modules', 'src', 'shared'].includes(parentName)
    );
  }
  return false;
}

export function isGeneratedFile(current, stat, portableRoot) {
  if (!stat.isFile()) return false;
  const name = path.basename(current);
  if (name === 'doctor.txt' || name === 'EXPORT-METADATA.json') return true;
  if (current.endsWith('.pyc')) return true;
  // Export archives are only generated beside the toolkit root; never delete
  // arbitrary .zip fixtures or assets deeper in the tree.
  if (current.endsWith('.zip')) return path.resolve(path.dirname(current)) === path.resolve(portableRoot);
  return false;
}

export function collectTargets(portableRoot) {
  const targets = walk(
    portableRoot,
    (current, stat) => isGeneratedDirectory(current, stat, portableRoot) || isGeneratedFile(current, stat, portableRoot)
  );
  return [...new Set(targets)].sort((left, right) => left.length - right.length);
}

/** True when target resolves (symlinks included) to a path strictly inside root. */
export function isInsideRoot(portableRoot, targetPath) {
  const realRoot = fs.realpathSync(portableRoot);
  const realTarget = fs.realpathSync(targetPath);
  const relative = path.relative(realRoot, realTarget);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Remove one target. Refuses symlinks and anything resolving outside the root.
 * @returns {'removed'|'missing'}
 */
export function removeTarget(portableRoot, targetPath) {
  let stat;
  try {
    stat = fs.lstatSync(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing';
    throw error;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to remove symlink: ${targetPath}`);
  }
  if (!isInsideRoot(portableRoot, targetPath)) {
    throw new Error(`Refusing to remove path outside toolkit root: ${toPosix(targetPath)}`);
  }
  fs.rmSync(targetPath, { recursive: stat.isDirectory(), force: true });
  return 'removed';
}

export function bytesFor(targetPath) {
  let stat;
  try {
    stat = fs.lstatSync(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
  if (stat.isSymbolicLink()) return 0;
  if (stat.isFile()) return stat.size;
  return walk(targetPath, (_current, currentStat) => currentStat.isFile()).reduce(
    (sum, filePath) => sum + fs.lstatSync(filePath).size,
    0
  );
}
