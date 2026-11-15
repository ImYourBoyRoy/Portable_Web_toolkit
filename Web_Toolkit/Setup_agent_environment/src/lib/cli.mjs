// ./Web_Toolkit/Setup_agent_environment/src/lib/cli.mjs
/**
 * Minimal CLI parser for the portable agent environment setup tool.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';

