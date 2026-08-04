import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AdapterError } from '../core/errors.mjs';

export async function runModuleAdapter(config, context) {
  if (typeof config.module !== 'string' || config.module.trim() === '') {
    throw new AdapterError('module adapter requires module');
  }
  const modulePath = path.resolve(context.projectRoot, config.module);
  let imported;
  const specifier = `${pathToFileURL(modulePath).href}?run=${encodeURIComponent(context.runId)}`;
  const importer = context.importModule ?? ((value) => import(value));
  try {
    imported = await importer(specifier);
  } catch (error) {
    throw new AdapterError(`Unable to load adapter module ${modulePath}: ${error.message}`, { modulePath }, error);
  }
  const run = imported.runAdapter ?? imported.default;
  if (typeof run !== 'function') {
    throw new AdapterError(`Adapter module ${modulePath} must export runAdapter() or a default function`);
  }
  const result = await run(config.options ?? {}, context);
  if (!result || typeof result !== 'object' || !Array.isArray(result.findings)) {
    throw new AdapterError(`Adapter module ${modulePath} returned an invalid result`);
  }
  if (!Number.isInteger(result.surfaceCount) || result.surfaceCount < 0) {
    throw new AdapterError(`Adapter module ${modulePath} must return a non-negative integer surfaceCount`);
  }
  return result;
}
