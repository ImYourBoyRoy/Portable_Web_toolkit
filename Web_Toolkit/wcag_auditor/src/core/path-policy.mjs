import path from 'node:path';

export function validateRelativeOutputFile(value) {
  if (typeof value !== 'string' || value.trim() === '') return 'must be a non-empty string';
  if (value.includes('\0')) return 'must not contain a NUL byte';
  if (path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value) || /^[/\\]{2}/.test(value)) {
    return 'must be a relative path';
  }
  const normalized = path.normalize(value);
  if (normalized === '.' || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    return 'must stay inside the configured output directory';
  }
  return null;
}

export function resolveOutputFile(outputDirectory, relativeFile) {
  const problem = validateRelativeOutputFile(relativeFile);
  if (problem) throw new TypeError(`reporter file ${problem}: ${relativeFile}`);
  const root = path.resolve(outputDirectory);
  const target = path.resolve(root, relativeFile);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw new TypeError(`reporter file must stay inside the configured output directory: ${relativeFile}`);
  }
  return target;
}
