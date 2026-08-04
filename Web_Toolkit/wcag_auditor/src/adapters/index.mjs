import { runCommandEvidenceAdapter } from './command-evidence.mjs';
import { runManualEvidenceAdapter } from './manual-evidence.mjs';
import { runModuleAdapter } from './module.mjs';
import { runNativeEvidenceAdapter } from './native-evidence.mjs';
import { runPlaywrightAxeAdapter } from './playwright-axe.mjs';
import { runSvelteAdapter } from './svelte.mjs';

export const BUILTIN_ADAPTERS = Object.freeze({
  'command-evidence': runCommandEvidenceAdapter,
  'manual-evidence': runManualEvidenceAdapter,
  module: runModuleAdapter,
  'native-evidence': runNativeEvidenceAdapter,
  'playwright-axe': runPlaywrightAxeAdapter,
  svelte: runSvelteAdapter
});

export function getBuiltinAdapters() {
  return { ...BUILTIN_ADAPTERS };
}

export {
  runCommandEvidenceAdapter,
  runManualEvidenceAdapter,
  runModuleAdapter,
  runNativeEvidenceAdapter,
  runPlaywrightAxeAdapter,
  runSvelteAdapter
};
