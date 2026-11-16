// ./Web_Toolkit/templates/analytics/lib/load-config.ts
/**
 * Build-time loader used by the components. Merges public env vars with the OPTIONAL src/data/analytics.json
 * (a missing file is fine) and warns once per build about invalid values.
 * Copy to: src/lib/analytics/load-config.ts. The glob path below assumes that destination.
 */
import { resolveAnalyticsConfig, type AnalyticsConfig } from './config';

const files = import.meta.glob('../../data/analytics.json', { eager: true, import: 'default' });

let cached: AnalyticsConfig | undefined;

export function getAnalyticsConfig(): AnalyticsConfig {
  if (!cached) {
    const json = Object.values(files)[0] ?? {};
    cached = resolveAnalyticsConfig(import.meta.env, json);
    for (const warning of cached.warnings) console.warn(`[analytics] ${warning}`);
  }
  return cached;
}
