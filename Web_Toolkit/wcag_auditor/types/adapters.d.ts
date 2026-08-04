export type {
  AdapterConfig,
  AdapterContext,
  AdapterResult,
  AdapterRunner,
  CommandEvidenceAdapterConfig,
  ManualEvidenceAdapterConfig,
  ModuleAdapterConfig,
  NativeEvidenceAdapterConfig,
  PlaywrightAxeAdapterConfig,
  PlaywrightScenarioConfig,
  PlaywrightStep,
  RawFinding,
  SvelteAdapterConfig
} from './index.d.ts';
import type {
  AdapterRunner,
  CommandEvidenceAdapterConfig,
  ManualEvidenceAdapterConfig,
  ModuleAdapterConfig,
  NativeEvidenceAdapterConfig,
  PlaywrightAxeAdapterConfig,
  SvelteAdapterConfig
} from './index.d.ts';

export const BUILTIN_ADAPTERS: Readonly<Record<string, AdapterRunner>>;
export function getBuiltinAdapters(): Record<string, AdapterRunner>;
export const runCommandEvidenceAdapter: AdapterRunner<CommandEvidenceAdapterConfig>;
export const runManualEvidenceAdapter: AdapterRunner<ManualEvidenceAdapterConfig>;
export const runModuleAdapter: AdapterRunner<ModuleAdapterConfig>;
export const runNativeEvidenceAdapter: AdapterRunner<NativeEvidenceAdapterConfig>;
export const runPlaywrightAxeAdapter: AdapterRunner<PlaywrightAxeAdapterConfig>;
export const runSvelteAdapter: AdapterRunner<SvelteAdapterConfig>;
