// ./Web_Toolkit/privacy_check/src/lib/cli.mjs
/**
 * Minimal CLI parser for privacy scanning.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';

