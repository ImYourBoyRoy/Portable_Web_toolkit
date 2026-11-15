// ./Web_Toolkit/site_quality_smoke/src/lib/cli.mjs
/**
 * Minimal CLI parser for site-quality-smoke.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';

