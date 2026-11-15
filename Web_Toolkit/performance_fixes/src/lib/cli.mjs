// ./Web_Toolkit/performance_fixes/src/lib/cli.mjs
/**
 * Minimal CLI parser for performance-fixes.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';

