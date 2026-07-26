// ./Web_Toolkit/vectorize_pipeline/src/commands/vectorize.mjs
/**
 * vectorize — raster → SVG via prepare + VTracer + light postprocess.
 */

import { mkdirSync, copyFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import { resolvePreset } from '../lib/presets.mjs';
import { prepareRaster } from '../lib/prepare.mjs';
import { findVtracer, runVtracer } from '../lib/vtracer.mjs';
import { postprocessSvg, summarizeSvg } from '../lib/postprocess.mjs';
import { readFileSync } from 'node:fs';

function truthy(v) {
  return v === true || v === 'true' || v === '1' || v === 'yes';
}

function defaultOutput(input) {
  const base = basename(input, extname(input));
  return join(dirname(input), `${base}.svg`);
}

export async function runVectorize(flags = {}) {
  const input = resolve(String(flags.input || flags.i || ''));
  if (!input || !existsSync(input)) {
    console.error('Missing --input <raster.png|jpg|webp>');
    return 1;
  }

  const apply = truthy(flags.apply);
  const dryRun = !apply;
  const presetName = flags.preset || 'logo';
  const preset = resolvePreset(presetName);
  const outPath = resolve(String(flags.output || flags.o || defaultOutput(input)));
  const ink = flags.ink || 'auto';
  const threshold = !truthy(flags['no-threshold']);
  const thresholdValue = flags['threshold-value'] != null ? Number(flags['threshold-value']) : 160;
  const scale =
    flags.scale != null
      ? Number(flags.scale)
      : preset.prepScale != null
        ? Number(preset.prepScale)
        : 1;
  const blur =
    flags.blur != null
      ? Number(flags.blur)
      : preset.prepBlur != null
        ? Number(preset.prepBlur)
        : 0;
  const currentColor = truthy(flags['current-color']);
  const fill = flags.fill || null;
  const keepPrep = truthy(flags['keep-prep']);

  const bin = findVtracer();
  if (!bin) {
    console.error('VTracer not found on PATH.');
    console.error('Install: cargo install vtracer');
    console.error('Or set VTRACER_PATH to the binary.');
    return 1;
  }

  const workDir = join(tmpdir(), `vectorize-pipeline-${randomBytes(4).toString('hex')}`);
  mkdirSync(workDir, { recursive: true });
  const prepPath = join(workDir, 'prepared.png');
  const rawSvgPath = join(workDir, 'raw.svg');

  console.log(`vectorize-pipeline — preset=${preset.name}`);
  console.log(`  input:  ${input}`);
  console.log(`  output: ${outPath}${dryRun ? ' (dry-run)' : ''}`);
  console.log(`  vtracer: ${bin}`);

  const prepMeta = prepareRaster({
    input,
    output: prepPath,
    ink,
    threshold: preset.colormode === 'bw' ? threshold : false,
    thresholdValue,
    scale,
    blur,
  });
  console.log(
    `  prepared: ink=${prepMeta.ink} threshold=${threshold && preset.colormode === 'bw'} scale=${scale} blur=${blur}`,
  );

  if (keepPrep) {
    const prepOut = join(dirname(outPath), `${basename(outPath, '.svg')}.prepared.png`);
    if (apply) {
      mkdirSync(dirname(prepOut), { recursive: true });
      copyFileSync(prepPath, prepOut);
      console.log(`  kept prep: ${prepOut}`);
    } else {
      console.log(`  would keep prep: ${prepOut}`);
    }
  }

  const overrides = {};
  if (flags.mode) overrides.mode = flags.mode;
  if (flags.colormode) overrides.colormode = flags.colormode;
  if (flags['filter-speckle'] != null) overrides.filter_speckle = flags['filter-speckle'];
  if (flags['corner-threshold'] != null) overrides.corner_threshold = flags['corner-threshold'];

  runVtracer({ bin, input: prepPath, output: rawSvgPath, preset, overrides });

  let svgText = readFileSync(rawSvgPath, 'utf8');
  // Write to temp then postprocess into place
  const staged = join(workDir, 'staged.svg');
  writeFileSync(staged, svgText, 'utf8');
  svgText = postprocessSvg(staged, { currentColor, fill, pretty: true });
  const summary = summarizeSvg(svgText);

  console.log(`  paths: ${summary.paths}`);
  console.log(`  fills: ${summary.uniqueFills.join(', ') || '(none)'}`);
  console.log(`  bytes: ${Buffer.byteLength(svgText)} (raw trace)`);

  if (dryRun) {
    console.log('\nDry-run only. Re-run with --apply to write the SVG.');
    // Still emit a preview path under /tmp for inspection
    const preview = join(workDir, basename(outPath));
    writeFileSync(preview, svgText, 'utf8');
    console.log(`Preview SVG: ${preview}`);
    return 0;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, svgText, 'utf8');
  console.log(`\nWrote ${outPath} (${statSync(outPath).size} bytes)`);
  return 0;
}
