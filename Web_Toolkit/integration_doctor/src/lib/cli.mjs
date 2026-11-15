// ./Web_Toolkit/integration_doctor/src/lib/cli.mjs
/**
 * Minimal CLI parser for integration-doctor.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';

