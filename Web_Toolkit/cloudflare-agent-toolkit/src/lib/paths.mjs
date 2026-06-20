// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/paths.mjs
/**
 * Filesystem path helpers for the Cloudflare Agent Toolkit.
 *
 * Resolves toolkit root plus portable runtime locations for reports and
 * temporary session metadata.
 */

import path from 'node:path';
import { resolvePortableRoot, resolveRuntimePath } from '../../../shared/lib/context.mjs';

export const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);
export const TOOLKIT_ROOT = path.resolve(PORTABLE_ROOT, 'cloudflare-agent-toolkit');
export const DEFAULT_OUTPUT_DIR = resolveRuntimePath(PORTABLE_ROOT, 'reports', 'cloudflare');
export const SESSION_META_PATH = resolveRuntimePath(PORTABLE_ROOT, 'sessions', 'cloudflare-session.json');

export function resolveFromToolkitRoot(...parts) {
  return path.join(TOOLKIT_ROOT, ...parts);
}

