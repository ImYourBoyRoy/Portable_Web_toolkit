// ./Web_Toolkit/site_doctor/src/lib/cli.mjs
/**
 * Minimal CLI parser for the portable site doctor tool.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';

