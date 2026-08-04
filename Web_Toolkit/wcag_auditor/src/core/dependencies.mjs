import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DependencyError } from './errors.mjs';

export async function importOptional(specifier, purpose, importer = defaultImporter) {
  try {
    return await importer(specifier);
  } catch (error) {
    const missing = error?.code === 'ERR_MODULE_NOT_FOUND'
      || error?.code === 'MODULE_NOT_FOUND'
      || /Cannot find package|Cannot find module/.test(error?.message ?? '');
    if (!missing) throw error;
    throw new DependencyError(
      `Optional dependency "${specifier}" is required for ${purpose}. Install it in the audited project.`,
      { specifier, purpose },
      error
    );
  }
}

export function createProjectImporter(projectRoot) {
  const root = path.resolve(projectRoot);
  const requireFromProject = createRequire(path.join(root, 'package.json'));
  return async (specifier) => {
    const resolved = requireFromProject.resolve(specifier);
    return import(pathToFileURL(resolved).href);
  };
}

function defaultImporter(specifier) {
  return import(specifier);
}
