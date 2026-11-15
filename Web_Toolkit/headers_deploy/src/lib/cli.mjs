// ./Web_Toolkit/headers_deploy/src/lib/cli.mjs
/**
 * Minimal CLI parser for headers-deploy.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';
export { toBool } from '../../../shared/lib/cli.mjs';
