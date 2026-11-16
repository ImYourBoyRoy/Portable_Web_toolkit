// ./Web_Toolkit/templates/fonts/woff2-metrics.mjs
/**
 * Zero-dependency reader for the vertical metrics and the average glyph width of a font file.
 *
 * Why: a metric-matched fallback face (size-adjust / ascent-override / descent-override) needs the web font's real numbers.
 * WOFF2 keeps `head`, `hhea`, `OS/2`, `cmap` and (usually) `hmtx` untransformed inside one Brotli stream, and Node ships
 * Brotli (`node:zlib`), so the numbers can be read straight from the file that is copied to public/fonts/.
 *
 * Supports WOFF2 and plain TrueType/OpenType (the latter is used to calibrate the system-font table in fonts-lib.mjs).
 * Pure: takes a Buffer, returns a plain object, never touches the filesystem.
 */

import { brotliDecompressSync } from 'node:zlib';

const WOFF2_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG',
  'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc',
  'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill'
];

/** English letter frequency (percent) plus the space, used to weight glyph widths the way a paragraph of text would. */
export const LETTER_WEIGHTS = Object.freeze({
  ' ': 18.0, a: 8.17, b: 1.49, c: 2.78, d: 4.25, e: 12.7, f: 2.23, g: 2.02, h: 6.09, i: 6.97, j: 0.15, k: 0.77, l: 4.03,
  m: 2.41, n: 6.75, o: 7.51, p: 1.93, q: 0.1, r: 5.99, s: 6.33, t: 9.06, u: 2.76, v: 0.98, w: 2.36, x: 0.15, y: 1.97, z: 0.07
});

function readBase128(buffer, offset) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const byte = buffer[offset + index];
    if (byte === undefined) throw new Error('Truncated WOFF2 table directory');
    value = (value * 128) + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: offset + index + 1 };
  }
  throw new Error('Invalid UIntBase128 in WOFF2 table directory');
}

/** Returns Map<tag, {buffer, transformed}> for a WOFF2 file. Tables stay as stored (glyf/loca are transformed). */
export function parseWoff2(buffer) {
  if (buffer.length < 48 || buffer.toString('latin1', 0, 4) !== 'wOF2') throw new Error('Not a WOFF2 file');
  const numTables = buffer.readUInt16BE(12);
  const compressedSize = buffer.readUInt32BE(20);
  let cursor = 48;
  const entries = [];
  for (let index = 0; index < numTables; index += 1) {
    const flags = buffer[cursor];
    cursor += 1;
    const tagIndex = flags & 0x3f;
    const transformVersion = (flags >> 6) & 0x03;
    let tag;
    if (tagIndex === 63) {
      tag = buffer.toString('latin1', cursor, cursor + 4);
      cursor += 4;
    } else {
      tag = WOFF2_TAGS[tagIndex];
    }
    const original = readBase128(buffer, cursor);
    cursor = original.next;
    const isGlyfLoca = tag === 'glyf' || tag === 'loca';
    const transformed = isGlyfLoca ? transformVersion === 0 : transformVersion !== 0;
    let length = original.value;
    if (transformed) {
      const transform = readBase128(buffer, cursor);
      cursor = transform.next;
      length = transform.value;
    }
    entries.push({ tag, length, transformed });
  }
  const data = brotliDecompressSync(buffer.subarray(cursor, cursor + compressedSize));
  const tables = new Map();
  let offset = 0;
  for (const entry of entries) {
    tables.set(entry.tag, { buffer: data.subarray(offset, offset + entry.length), transformed: entry.transformed });
    offset += entry.length;
  }
  return tables;
}

/** Returns Map<tag, {buffer, transformed}> for a TrueType/OpenType file (single font, not a collection). */
export function parseSfnt(buffer) {
  if (buffer.length < 12) throw new Error('Not an sfnt font file');
  const numTables = buffer.readUInt16BE(4);
  const tables = new Map();
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + (index * 16);
    const tag = buffer.toString('latin1', record, record + 4);
    const offset = buffer.readUInt32BE(record + 8);
    const length = buffer.readUInt32BE(record + 12);
    tables.set(tag, { buffer: buffer.subarray(offset, offset + length), transformed: false });
  }
  return tables;
}

export function parseFontTables(buffer) {
  const magic = buffer.toString('latin1', 0, 4);
  if (magic === 'wOF2') return parseWoff2(buffer);
  if (magic === 'wOFF') throw new Error('WOFF 1 is not supported; use a woff2 file');
  return parseSfnt(buffer);
}

function lookupFormat4(table, offset, codePoint) {
  const segCount = table.readUInt16BE(offset + 6) / 2;
  const endCodes = offset + 14;
  const startCodes = endCodes + (segCount * 2) + 2;
  const deltas = startCodes + (segCount * 2);
  const rangeOffsets = deltas + (segCount * 2);
  for (let segment = 0; segment < segCount; segment += 1) {
    if (table.readUInt16BE(endCodes + (segment * 2)) < codePoint) continue;
    const start = table.readUInt16BE(startCodes + (segment * 2));
    if (start > codePoint) return 0;
    const delta = table.readInt16BE(deltas + (segment * 2));
    const rangeOffset = table.readUInt16BE(rangeOffsets + (segment * 2));
    if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
    const address = rangeOffsets + (segment * 2) + rangeOffset + ((codePoint - start) * 2);
    if (address + 2 > table.length) return 0;
    const glyph = table.readUInt16BE(address);
    return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
  }
  return 0;
}

function lookupFormat12(table, offset, codePoint) {
  const groups = table.readUInt32BE(offset + 12);
  for (let group = 0; group < groups; group += 1) {
    const record = offset + 16 + (group * 12);
    const start = table.readUInt32BE(record);
    const end = table.readUInt32BE(record + 4);
    if (codePoint >= start && codePoint <= end) return table.readUInt32BE(record + 8) + (codePoint - start);
  }
  return 0;
}

/** Returns a (codePoint) => glyphId function from the best Unicode cmap subtable, or null. */
export function createGlyphLookup(cmap) {
  if (!cmap || cmap.length < 4) return null;
  const count = cmap.readUInt16BE(2);
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const record = 4 + (index * 8);
    const platform = cmap.readUInt16BE(record);
    const encoding = cmap.readUInt16BE(record + 2);
    const offset = cmap.readUInt32BE(record + 4);
    const format = cmap.readUInt16BE(offset);
    const unicode = (platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0;
    if (!unicode || (format !== 4 && format !== 12)) continue;
    candidates.push({ offset, format, rank: format === 12 ? 0 : 1 });
  }
  candidates.sort((left, right) => left.rank - right.rank);
  const best = candidates[0];
  if (!best) return null;
  return (codePoint) => (best.format === 12 ? lookupFormat12(cmap, best.offset, codePoint) : lookupFormat4(cmap, best.offset, codePoint));
}

function weightedAverageWidth(tables, numberOfHMetrics) {
  const hmtx = tables.get('hmtx');
  const cmap = tables.get('cmap');
  if (!hmtx || !cmap || cmap.transformed || numberOfHMetrics < 1) return null;
  const lookup = createGlyphLookup(cmap.buffer);
  if (!lookup) return null;
  const base = hmtx.transformed ? 1 : 0; // transformed hmtx: one flags byte, then the advance widths
  const advance = (glyph) => {
    const index = Math.min(glyph, numberOfHMetrics - 1);
    const position = base + (index * (hmtx.transformed ? 2 : 4));
    return position + 2 <= hmtx.buffer.length ? hmtx.buffer.readUInt16BE(position) : 0;
  };
  let total = 0;
  let weight = 0;
  for (const [character, share] of Object.entries(LETTER_WEIGHTS)) {
    const glyph = lookup(character.codePointAt(0));
    if (!glyph) continue;
    total += advance(glyph) * share;
    weight += share;
  }
  return weight > 0 ? total / weight : null;
}

/**
 * Reads { unitsPerEm, ascent, descent (negative), lineGap, xWidthAvg, xWidthSource } from a font file buffer.
 * Vertical metrics follow what browsers do: OS/2 typo metrics when USE_TYPO_METRICS is set, else hhea, else win.
 * Throws a descriptive Error when the file is not a usable font; callers decide whether that is fatal.
 */
export function readFontMetrics(buffer) {
  const tables = parseFontTables(buffer);
  const head = tables.get('head')?.buffer;
  const hhea = tables.get('hhea')?.buffer;
  if (!head || head.length < 20 || !hhea || hhea.length < 36) throw new Error('Font is missing head/hhea tables');
  const unitsPerEm = head.readUInt16BE(18);
  const os2 = tables.get('OS/2')?.buffer;
  let ascent = hhea.readInt16BE(4);
  let descent = hhea.readInt16BE(6);
  let lineGap = hhea.readInt16BE(8);
  if (os2 && os2.length >= 78) {
    const useTypo = (os2.readUInt16BE(62) & 0x80) !== 0;
    const typoAscent = os2.readInt16BE(68);
    const typoDescent = os2.readInt16BE(70);
    if (useTypo && (typoAscent !== 0 || typoDescent !== 0)) {
      ascent = typoAscent;
      descent = typoDescent;
      lineGap = os2.readInt16BE(72);
    } else if (ascent === 0 && descent === 0) {
      ascent = os2.readUInt16BE(74);
      descent = -os2.readUInt16BE(76);
    }
  }
  const weighted = weightedAverageWidth(tables, hhea.readUInt16BE(34));
  const os2Width = os2 && os2.length >= 4 ? os2.readInt16BE(2) : 0;
  const xWidthAvg = weighted ?? os2Width;
  if (!unitsPerEm || !xWidthAvg) throw new Error('Font has no usable width data');
  return {
    unitsPerEm,
    ascent,
    descent: -Math.abs(descent),
    lineGap,
    xWidthAvg: Math.round(xWidthAvg),
    xWidthSource: weighted ? 'hmtx' : 'os2'
  };
}
