// ./Web_Toolkit/image_pipeline/src/lib/cli.mjs
/**
 * Minimal CLI parser for image-pipeline.
 * Delegates to the shared parser so every tool handles `--key=value`, boolean
 * switches, and `--` identically.
 */

export { parseCliArgs } from '../../../shared/lib/cli.mjs';

