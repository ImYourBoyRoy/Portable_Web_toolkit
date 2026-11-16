// ./Web_Toolkit/form_doctor/src/analysis.mjs
/**
 * Small, dependency-free source helpers for the static scan: comment stripping that keeps line numbers,
 * brace matching, a relative-import graph, and line lookup. Heuristics on purpose (no TypeScript parser), so every
 * helper reports failure instead of guessing: callers turn a failed match into a `malformed-surface` finding.
 */

import fs from 'node:fs';
import path from 'node:path';

const RESOLVE_EXTENSIONS = ['', '.ts', '.mts', '.js', '.mjs', '.tsx', '.astro', '/index.ts', '/index.js', '/index.mjs'];


/** True when the "/" at index starts a regex literal (previous significant token cannot end an expression). */
function startsRegex(source, index) {
  const next = source[index + 1];
  if (next === '/' || next === '*') return false;
  let j = index - 1;
  while (j >= 0 && /\s/.test(source[j])) j -= 1;
  if (j < 0) return true;
  const prev = source[j];
  if ('(,=:[!&|?{};+-*%<>~^'.includes(prev)) return true;
  const word = source.slice(Math.max(0, j - 8), j + 1).match(/([A-Za-z]+)$/)?.[1];
  return word === 'return' || word === 'typeof' || word === 'case' || word === 'in' || word === 'of' || word === 'void';
}

/** Index of the "/" that closes the regex literal starting at index, or -1. Honors escapes and character classes. */
function regexEnd(source, index) {
  let inClass = false;
  for (let i = index + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '\n') return -1;
    if (inClass) {
      if (ch === ']') inClass = false;
    } else if (ch === '[') inClass = true;
    else if (ch === '/') return i;
  }
  return -1;
}

/** Replaces comments with spaces (newlines kept) so offsets and line numbers stay valid. String contents are kept. */
export function stripComments(source) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && startsRegex(source, i)) {
      const end = regexEnd(source, i);
      if (end > i) {
        out += source.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) if (source[i] === '\n') line += 1;
  return line;
}

/**
 * Given the index of an opening `{`, returns the index of the matching `}` or -1. Skips strings, template
 * literals and (already stripped) comments well enough for handler code. -1 means "cannot tell": fail closed.
 */
export function matchBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (quote === '`' && ch === '$' && source[i + 1] === '{') {
        const end = matchBrace(source, i + 1);
        if (end < 0) return -1;
        i = end;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && startsRegex(source, i)) {
      const end = regexEnd(source, i);
      if (end > i) {
        i = end;
        continue;
      }
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = `${base}${ext}`;
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // try the next extension
    }
  }
  return null;
}

/** The file plus the relative files it imports (depth-limited), so a thin route is judged with the logic it delegates to. */
export function collectGraph(entry, readFile, maxDepth = 3) {
  const files = new Map();
  const visit = (file, depth) => {
    if (files.has(file)) return;
    const text = readFile(file);
    if (text === null) return;
    files.set(file, text);
    if (depth >= maxDepth) return;
    const stripped = stripComments(text);
    for (const match of stripped.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const resolved = resolveLocalImport(file, match[1] ?? match[2]);
      if (resolved) visit(resolved, depth + 1);
    }
  };
  visit(entry, 0);
  return files;
}
