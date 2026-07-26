// ./Web_Toolkit/vectorize_pipeline/src/commands/from-font.mjs
/**
 * from-font — build a clean outlined SVG wordmark from TTF/OTF fonts.
 *
 * Prefer this over auto-trace when the raster source is low-res or already aliased.
 * Requires: opentype.js (npm dep of this package).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

function truthy(v) {
  return v === true || v === 'true' || v === '1' || v === 'yes';
}

function loadOpentype() {
  try {
    return require('opentype.js');
  } catch {
    // Resolve from this package's node_modules even when invoked via symlink
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgRoot = resolve(here, '../..');
    return require(resolve(pkgRoot, 'node_modules/opentype.js'));
  }
}

function loadFont(opentype, path) {
  const buf = readFileSync(path);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

function glyphsPath(font, text, fontSize, letterSpacingEm = 0) {
  let x = 0;
  const parts = [];
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    const d = g.getPath(x, 0, fontSize).toPathData(3);
    if (d) parts.push(d);
    x += (g.advanceWidth / font.unitsPerEm) * fontSize + letterSpacingEm * fontSize;
  }
  return { d: parts.join(' '), width: x };
}

function taperedRule(xOuter, xInner, y, thickness, tipAtOuter) {
  const half = thickness / 2;
  if (tipAtOuter) {
    return `M ${xOuter.toFixed(2)} ${y.toFixed(2)} L ${xInner.toFixed(2)} ${(y - half).toFixed(2)} L ${xInner.toFixed(2)} ${(y + half).toFixed(2)} Z`;
  }
  return `M ${xInner.toFixed(2)} ${(y - half).toFixed(2)} L ${xInner.toFixed(2)} ${(y + half).toFixed(2)} L ${xOuter.toFixed(2)} ${y.toFixed(2)} Z`;
}

export async function runFromFont(flags = {}) {
  const apply = truthy(flags.apply);
  const title = String(flags.title || flags.text || '').trim();
  const sub = String(flags.subtitle || flags.sub || '').trim();
  const serifPath = resolve(String(flags.serif || flags['title-font'] || ''));
  const sansPath = resolve(String(flags.sans || flags['subtitle-font'] || flags.serif || ''));
  const outPath = resolve(String(flags.output || flags.o || './wordmark.svg'));
  const fill = flags.fill || (truthy(flags['current-color']) ? 'currentColor' : '#f4fffe');
  const titleSize = Number(flags['title-size'] || 160);
  const subSize = Number(flags['subtitle-size'] || flags['sub-size'] || 48);
  const tracking = Number(flags.tracking || 0.32);
  const gap = Number(flags.gap || 40);
  const padX = Number(flags['pad-x'] || 28);
  const padY = Number(flags['pad-y'] || 22);
  const ruleThickness = Number(flags['rule-thickness'] || 2.6);
  const ruleGap = Number(flags['rule-gap'] || 24);
  const withRules = !truthy(flags['no-rules']);

  if (!title) {
    console.error('Missing --title "Wordmark Text"');
    return 1;
  }
  if (!serifPath || !existsSync(serifPath)) {
    console.error('Missing --serif <font.ttf|otf>');
    return 1;
  }
  if (sub && (!sansPath || !existsSync(sansPath))) {
    console.error('Missing --sans <font.ttf|otf> (required when --subtitle is set)');
    return 1;
  }

  let opentype;
  try {
    opentype = loadOpentype();
  } catch (err) {
    console.error('opentype.js not found. From vectorize_pipeline/: npm install');
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const serif = loadFont(opentype, serifPath);
  const sans = sub ? loadFont(opentype, sansPath) : null;
  const titlePath = glyphsPath(serif, title, titleSize, 0);
  const gamesPath = sub ? glyphsPath(sans, sub, subSize, tracking) : null;

  const titleW = titlePath.width;
  const gamesW = gamesPath ? gamesPath.width : 0;
  const width = titleW + padX * 2;
  const titleY = padY + titleSize * 0.78;
  const gamesY = gamesPath ? titleY + gap + subSize * 0.72 : titleY;
  const titleX = (width - titleW) / 2;
  const gamesX = gamesPath ? (width - gamesW) / 2 : 0;
  const height = (gamesPath ? gamesY : titleY) + padY + 12;

  const parts = [
    `    <path transform="translate(${titleX.toFixed(2)} ${titleY.toFixed(2)})" d="${titlePath.d}"/>`,
  ];
  if (gamesPath) {
    parts.push(
      `    <path transform="translate(${gamesX.toFixed(2)} ${gamesY.toFixed(2)})" d="${gamesPath.d}"/>`,
    );
    if (withRules) {
      const ruleY = gamesY - subSize * 0.35;
      const leftInner = gamesX - ruleGap;
      const rightInner = gamesX + gamesW + ruleGap;
      const leftOuter = titleX + 2;
      const rightOuter = titleX + titleW - 2;
      parts.push(`    <path d="${taperedRule(leftOuter, leftInner, ruleY, ruleThickness, true)}"/>`);
      parts.push(`    <path d="${taperedRule(rightOuter, rightInner, ruleY, ruleThickness, false)}"/>`);
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" width="${Math.round(width)}" height="${Math.round(height)}">
  <title>${title}${sub ? ` ${sub}` : ''}</title>
  <g fill="${fill}" fill-rule="nonzero">
${parts.join('\n')}
  </g>
</svg>
`;

  console.log(`vectorize-pipeline from-font`);
  console.log(`  title:  ${title}${sub ? ` / ${sub}` : ''}`);
  console.log(`  serif:  ${serifPath}`);
  if (sub) console.log(`  sans:   ${sansPath}`);
  console.log(`  output: ${outPath}${apply ? '' : ' (dry-run)'}`);
  console.log(`  size:   ${Math.round(width)}×${Math.round(height)}  bytes=${Buffer.byteLength(svg)}`);

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write the SVG.');
    return 0;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, svg, 'utf8');
  console.log(`\nWrote ${outPath} (${statSync(outPath).size} bytes)`);
  return 0;
}
