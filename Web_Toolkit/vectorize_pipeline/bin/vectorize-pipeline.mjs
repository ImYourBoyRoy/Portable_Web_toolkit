#!/usr/bin/env node
// ./Web_Toolkit/vectorize_pipeline/bin/vectorize-pipeline.mjs
/**
 * CLI entrypoint for vectorize-pipeline — raster→SVG (VTracer) or font→SVG outlines.
 *
 * Depends on: VTracer (`cargo install vtracer`), Python 3 + Pillow + NumPy,
 * and opentype.js for `from-font` (npm dep of this package).
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runVectorize } from '../src/commands/vectorize.mjs';
import { runFromFont } from '../src/commands/from-font.mjs';
import { PRESETS } from '../src/lib/presets.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  const presetLines = Object.entries(PRESETS).map(([name, p]) => ({
    name,
    description: p.description || name,
  }));
  return printStandardHelp({
    name: 'vectorize-pipeline',
    summary:
      'Clean SVG wordmarks: prefer from-font for crisp type; vectorize for high-contrast rasters',
    usage: [
      'vectorize-pipeline from-font --title "Brand Name" --serif ./Font.ttf --apply',
      'vectorize-pipeline vectorize --input <raster> [--output <file.svg>] [--preset logo_smooth] [--apply]',
    ],
    commands: [
      {
        name: 'from-font',
        description:
          'Outline a wordmark from TTF/OTF (best quality when raster masters are low-res/aliased).',
      },
      {
        name: 'vectorize',
        description:
          'Flatten transparency, optional upscale/blur + B&W threshold, run VTracer, postprocess SVG.',
      },
    ],
    flags: [
      { name: '--title <text>', description: 'from-font: main line.' },
      { name: '--subtitle <text>', description: 'from-font: optional second line (e.g. GAMES).' },
      { name: '--serif <font>', description: 'from-font: title font path.' },
      { name: '--sans <font>', description: 'from-font: subtitle font path.' },
      { name: '--input <path>', description: 'vectorize: source PNG/JPG/WebP.' },
      { name: '--output <path>', description: 'Destination SVG.' },
      { name: '--preset <name>', description: 'logo | logo_smooth | logo_polygon | poster | photo.' },
      { name: '--scale <n>', description: 'vectorize: upscale before threshold (logo_smooth uses 4).' },
      { name: '--blur <n>', description: 'vectorize: Gaussian blur before threshold.' },
      { name: '--apply', description: 'Write the SVG. Without this flag, dry-run only.' },
      { name: '--current-color', description: 'Themeable fill (inline SVG only, not <img>).' },
      { name: '--fill <css-color>', description: 'Force fill (e.g. #f4fffe).' },
      { name: '--keep-prep', description: 'Also write the prepared raster next to the SVG.' },
    ],
    examples: [
      'vectorize-pipeline from-font --title "Example Studio" --subtitle WORKS --serif ./ExampleSerif.ttf --sans ./ExampleSans.ttf --fill "#f4fffe" --apply',
      'vectorize-pipeline vectorize --input ./logo.png --preset logo_smooth --fill "#000" --apply',
    ],
    notes: [
      'If the source PNG looks choppy at 200% zoom, from-font (or a higher-res export) will beat auto-trace.',
      'Install VTracer: cargo install vtracer (or set VTRACER_PATH).',
      'from-font needs: cd Web_Toolkit/vectorize_pipeline && npm install',
      ...presetLines.map((p) => `Preset ${p.name}: ${p.description}`),
    ],
    exitCodes: [
      { name: '0', description: 'Success.' },
      { name: '1', description: 'Failure (missing tools, bad input, etc.).' },
    ],
  });
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const primary = String(command[0] || 'help').toLowerCase();
  if (['help', '--help', '-h'].includes(primary)) {
    printHelp();
    return 0;
  }
  if (primary === 'from-font' || primary === 'from_font' || primary === 'font') {
    return runFromFont(flags);
  }
  if (primary === 'vectorize') return runVectorize(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main()
  .then((code) => {
    process.exitCode = typeof code === 'number' ? code : 1;
  })
  .catch((error) => {
    console.error('\n[vectorize-pipeline] failed');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
