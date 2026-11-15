// ./Web_Toolkit/brand_doctor/src/lib/cli.mjs
/**
 * Minimal CLI parser for brand-doctor.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';

