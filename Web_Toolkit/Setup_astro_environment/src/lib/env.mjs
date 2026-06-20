// ./Web_Toolkit/Setup_astro_environment/src/lib/env.mjs
/**
 * Shared env loader for setup-astro-environment.
 */

import { loadPortableEnv as loadPortableEnvFromShared, resolvePortableRoot } from '../../../shared/lib/context.mjs';

const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);

export function loadPortableEnv() {
  return loadPortableEnvFromShared(PORTABLE_ROOT);
}

