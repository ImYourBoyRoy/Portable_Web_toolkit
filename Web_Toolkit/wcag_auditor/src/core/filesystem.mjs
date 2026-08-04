import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_IGNORES } from './constants.mjs';

export async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
}

export async function atomicWriteFile(filePath, content) {
  await ensureDirectory(path.dirname(filePath));
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, content, 'utf8');
  await fs.rename(temporary, filePath);
}

export async function readJsonFile(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${filePath}: ${error.message}`, { cause: error });
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new SyntaxError(`Invalid JSON in ${filePath}: ${error.message}`, { cause: error });
  }
}

export async function listFiles(root, options = {}) {
  const absoluteRoot = path.resolve(root);
  const include = options.include ?? ['**/*'];
  const ignoreNames = new Set(options.ignoreNames ?? DEFAULT_IGNORES);
  const followSymlinks = options.followSymlinks ?? false;
  const maxFiles = options.maxFiles ?? 10_000;
  const output = [];
  const visited = new Set();

  async function visit(current) {
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() && !followSymlinks) return;

    const real = await fs.realpath(current);
    if (visited.has(real)) return;
    visited.add(real);

    if (stat.isFile()) {
      const relative = normalizePath(path.relative(absoluteRoot, current));
      if (include.some((glob) => matchesGlob(relative, glob))) output.push(current);
      return;
    }
    if (!stat.isDirectory()) return;

    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (ignoreNames.has(entry.name)) continue;
      await visit(path.join(current, entry.name));
      if (output.length > maxFiles) {
        throw new RangeError(`File scan exceeded maxFiles=${maxFiles} under ${absoluteRoot}`);
      }
    }
  }

  await visit(absoluteRoot);
  return output.sort((left, right) => left.localeCompare(right));
}

export function normalizePath(value) {
  return value.split(path.sep).join('/');
}

export function matchesGlob(relativePath, glob) {
  const normalizedPath = normalizePath(relativePath).replace(/^\.\//, '');
  const normalizedGlob = normalizePath(glob).replace(/^\.\//, '');
  return globToRegExp(normalizedGlob).test(normalizedPath);
}

function globToRegExp(glob) {
  let expression = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    const next = glob[index + 1];
    if (character === '*' && next === '*') {
      const after = glob[index + 2];
      if (after === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
    } else if (character === '*') {
      expression += '[^/]*';
    } else if (character === '?') {
      expression += '[^/]';
    } else {
      expression += escapeRegExp(character);
    }
  }
  return new RegExp(`${expression}$`);
}

function escapeRegExp(value) {
  return /[\\^$.*+?()[\]{}|]/.test(value) ? `\\${value}` : value;
}
