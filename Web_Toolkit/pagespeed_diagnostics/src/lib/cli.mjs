// ./Web_Toolkit/pagespeed_diagnostics/src/lib/cli.mjs
/**
 * Minimal CLI parser for pagespeed-diagnostics.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';

