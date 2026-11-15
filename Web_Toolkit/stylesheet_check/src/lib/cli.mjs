// ./Web_Toolkit/stylesheet_check/src/lib/cli.mjs
/**
 * Minimal CLI parser for stylesheet-check.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';
