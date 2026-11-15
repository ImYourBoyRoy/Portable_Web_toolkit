// ./Web_Toolkit/browser_diagnostics/src/lib/cli.mjs
/**
 * Minimal CLI parser for browser-diagnostics.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';

