// ./Web_Toolkit/init_site_profile/src/lib/cli.mjs
/**
 * Minimal CLI parser for site profile bootstrap commands.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';

