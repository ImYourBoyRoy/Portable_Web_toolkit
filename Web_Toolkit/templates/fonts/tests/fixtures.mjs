// ./Web_Toolkit/templates/fonts/tests/fixtures.mjs
/**
 * Test helpers: build tiny but structurally valid TrueType and WOFF2 fonts (head, hhea, OS/2, cmap format 4, hmtx)
 * so the metric reader and the sync script can be tested without shipping binary fixtures or installing @fontsource.
 */

import { brotliCompressSync } from 'node:zlib';

const LETTERS = ' abcdefghijklmnopqrstuvwxyz';

function table(size, fill) {
  const buffer = Buffer.alloc(size);
  fill(buffer);
  return buffer;
}

/** options: unitsPerEm, ascent, descent, lineGap, widths (char -> advance), defaultWidth, useTypoMetrics, typo, win */
export function buildTables(options = {}) {
  const {
    unitsPerEm = 1000,
    ascent = 900,
    descent = -250,
    lineGap = 0,
    defaultWidth = 500,
    widths = {},
    useTypoMetrics = false,
    typo = { ascent: 800, descent: -200, lineGap: 10 },
    win = { ascent: 950, descent: 260 }
  } = options;
  const characters = [...LETTERS];
  const advances = [0, ...characters.map((character) => widths[character] ?? defaultWidth)];

  const head = table(54, (buffer) => buffer.writeUInt16BE(unitsPerEm, 18));
  const hhea = table(36, (buffer) => {
    buffer.writeInt16BE(ascent, 4);
    buffer.writeInt16BE(descent, 6);
    buffer.writeInt16BE(lineGap, 8);
    buffer.writeUInt16BE(advances.length, 34);
  });
  const os2 = table(96, (buffer) => {
    buffer.writeUInt16BE(4, 0);
    buffer.writeInt16BE(Math.round(defaultWidth), 2);
    buffer.writeUInt16BE(useTypoMetrics ? 0x80 : 0, 62);
    buffer.writeInt16BE(typo.ascent, 68);
    buffer.writeInt16BE(typo.descent, 70);
    buffer.writeInt16BE(typo.lineGap, 72);
    buffer.writeUInt16BE(win.ascent, 74);
    buffer.writeUInt16BE(win.descent, 76);
  });

  // cmap: one segment per character plus the 0xFFFF terminator, format 4 under platform 3 / encoding 1.
  const segments = characters.map((character, index) => ({ code: character.codePointAt(0), glyph: index + 1 }));
  const segCount = segments.length + 1;
  const subtable = Buffer.alloc(16 + (segCount * 8));
  subtable.writeUInt16BE(4, 0);
  subtable.writeUInt16BE(subtable.length, 2);
  subtable.writeUInt16BE(segCount * 2, 6);
  const ends = 14;
  const starts = ends + (segCount * 2) + 2;
  const deltas = starts + (segCount * 2);
  const ranges = deltas + (segCount * 2);
  segments.forEach(({ code, glyph }, index) => {
    subtable.writeUInt16BE(code, ends + (index * 2));
    subtable.writeUInt16BE(code, starts + (index * 2));
    subtable.writeInt16BE((glyph - code) << 16 >> 16, deltas + (index * 2));
    subtable.writeUInt16BE(0, ranges + (index * 2));
  });
  subtable.writeUInt16BE(0xffff, ends + (segments.length * 2));
  subtable.writeUInt16BE(0xffff, starts + (segments.length * 2));
  subtable.writeInt16BE(1, deltas + (segments.length * 2));
  const cmap = Buffer.alloc(12 + subtable.length);
  cmap.writeUInt16BE(0, 0);
  cmap.writeUInt16BE(1, 2);
  cmap.writeUInt16BE(3, 4);
  cmap.writeUInt16BE(1, 6);
  cmap.writeUInt32BE(12, 8);
  subtable.copy(cmap, 12);

  const hmtx = Buffer.alloc(advances.length * 4);
  advances.forEach((advance, index) => hmtx.writeUInt16BE(advance, index * 4));
  const hmtxTransformed = Buffer.alloc(1 + (advances.length * 2));
  advances.forEach((advance, index) => hmtxTransformed.writeUInt16BE(advance, 1 + (index * 2)));

  return { cmap, head, hhea, hmtx, hmtxTransformed, 'OS/2': os2 };
}

export function buildTtf(options = {}) {
  const tables = buildTables(options);
  const names = ['cmap', 'head', 'hhea', 'hmtx', 'OS/2'];
  const directory = Buffer.alloc(12 + (names.length * 16));
  directory.writeUInt32BE(0x00010000, 0);
  directory.writeUInt16BE(names.length, 4);
  let offset = directory.length;
  const parts = [];
  names.forEach((name, index) => {
    const data = tables[name === 'hmtx' ? 'hmtx' : name];
    const record = 12 + (index * 16);
    directory.write(name, record, 'latin1');
    directory.writeUInt32BE(offset, record + 8);
    directory.writeUInt32BE(data.length, record + 12);
    parts.push(data);
    offset += data.length;
  });
  return Buffer.concat([directory, ...parts]);
}

function base128(value) {
  const bytes = [value & 0x7f];
  let rest = Math.floor(value / 128);
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  return Buffer.from(bytes);
}

const KNOWN = { cmap: 0, head: 1, hhea: 2, hmtx: 3, 'OS/2': 6 };

/** options as buildTables plus { transformHmtx: true } to store hmtx in the WOFF2 "lsb omitted" form. */
export function buildWoff2(options = {}) {
  const tables = buildTables(options);
  const transformHmtx = options.transformHmtx === true;
  const names = ['cmap', 'head', 'hhea', 'hmtx', 'OS/2'];
  const directory = [];
  const data = [];
  for (const name of names) {
    const hmtxTransformed = name === 'hmtx' && transformHmtx;
    const body = hmtxTransformed ? tables.hmtxTransformed : tables[name];
    const flags = KNOWN[name] | (hmtxTransformed ? 0x40 : 0);
    directory.push(Buffer.from([flags]), base128(tables[name].length));
    if (hmtxTransformed) directory.push(base128(body.length));
    data.push(body);
  }
  const compressed = brotliCompressSync(Buffer.concat(data));
  const directoryBuffer = Buffer.concat(directory);
  const header = Buffer.alloc(48);
  header.write('wOF2', 0, 'latin1');
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt16BE(names.length, 12);
  header.writeUInt32BE(compressed.length, 20);
  const file = Buffer.concat([header, directoryBuffer, compressed]);
  file.writeUInt32BE(file.length, 8);
  return file;
}
