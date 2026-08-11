// ./Web_Toolkit/wcag_auditor/src/core/source-locate.mjs
/**
 * Best-effort map of rendered CSS selectors / HTML snippets → client source file:line.
 *
 * Playwright-axe findings usually lack file/line. This indexer scans the project
 * `src/` (and common UI roots) for class names and HTML fragments so dashboards
 * can show actionable locations. Matches are hints, not compiler truth.
 */

import fs from 'node:fs';
import path from 'node:path';

const SOURCE_EXTENSIONS = new Set([
  '.astro', '.svelte', '.vue', '.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs',
  '.html', '.css', '.scss', '.sass', '.mdx'
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.astro', '.wrangler', 'output', '.runtime',
  'coverage', '.wcag-audit-results'
]);

function walkSourceFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTENSIONS.has(ext)) files.push(full);
      }
    }
  }
  return files;
}

function extractClassesFromSelector(selector) {
  const text = String(selector || '');
  const classes = new Set();
  for (const match of text.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
    classes.add(match[1]);
  }
  return [...classes];
}

function extractClassesFromHtml(html) {
  const text = String(html || '');
  const classes = new Set();
  for (const match of text.matchAll(/class\s*=\s*["']([^"']+)["']/gi)) {
    for (const token of match[1].split(/\s+/)) {
      if (token) classes.add(token);
    }
  }
  return [...classes];
}

function buildClassIndex(projectRoot) {
  const roots = ['src', 'app', 'components', 'ui']
    .map((name) => path.join(projectRoot, name))
    .filter((dir) => fs.existsSync(dir));
  if (roots.length === 0 && fs.existsSync(projectRoot)) roots.push(projectRoot);

  /** @type {Map<string, Array<{ file: string, line: number, kind: string }>>} */
  const index = new Map();

  for (const root of roots) {
    for (const absolute of walkSourceFiles(root)) {
      let content = '';
      try {
        content = fs.readFileSync(absolute, 'utf8');
      } catch {
        continue;
      }
      const relative = path.relative(projectRoot, absolute).replace(/\\/g, '/');
      const ext = path.extname(absolute).toLowerCase();
      const kind = ['.css', '.scss', '.sass'].includes(ext) ? 'style' : 'markup';
      const lines = content.split(/\r?\n/);
      lines.forEach((line, indexZero) => {
        for (const match of line.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
          const className = match[1];
          if (!index.has(className)) index.set(className, []);
          index.get(className).push({ file: relative, line: indexZero + 1, kind });
        }
        for (const match of line.matchAll(/class(?:Name)?\s*=\s*["'`]([^"'`]+)["'`]/g)) {
          for (const token of match[1].split(/\s+/)) {
            if (!token || token.includes('{')) continue;
            if (!index.has(token)) index.set(token, []);
            index.get(token).push({ file: relative, line: indexZero + 1, kind: 'markup' });
          }
        }
      });
    }
  }
  return index;
}

function pickBestHit(hits = []) {
  if (!hits.length) return null;
  const markup = hits.find((hit) => hit.kind === 'markup');
  return markup || hits[0];
}

function isLikelySourceFile(file) {
  if (!file) return false;
  return SOURCE_EXTENSIONS.has(path.extname(String(file)).toLowerCase());
}

function candidateClasses(selector, html) {
  const fromHtml = extractClassesFromHtml(html);
  const fromSelector = extractClassesFromSelector(selector);
  // Prefer HTML node classes, then selector leaf classes (rightmost), then the rest.
  const ordered = [
    ...fromHtml,
    ...[...fromSelector].reverse(),
    ...fromSelector
  ];
  const seen = new Set();
  const unique = [];
  for (const name of ordered) {
    if (seen.has(name)) continue;
    seen.add(name);
    unique.push(name);
  }
  return unique;
}

/**
 * Enrich findings that lack a real source file:line with best-effort locations.
 * @param {Array<object>} findings
 * @param {{ projectRoot: string }} options
 */
export function enrichFindingsWithSourceLocations(findings, { projectRoot } = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  if (!fs.existsSync(root)) return findings;

  let index = null;
  const ensureIndex = () => {
    if (!index) index = buildClassIndex(root);
    return index;
  };

  return findings.map((finding) => {
    const existingFile = finding?.target?.file;
    const existingLine = finding?.target?.line;
    if (isLikelySourceFile(existingFile) && existingLine) return finding;

    const selector = finding?.target?.selectorOrNode || '';
    const html = finding?.evidence?.html || '';
    const classes = candidateClasses(selector, html);
    if (classes.length === 0) {
      return {
        ...finding,
        target: {
          ...finding.target,
          sourceHint: 'Rendered DOM only — no class selector available to map to source.'
        }
      };
    }

    const classIndex = ensureIndex();
    let best = null;
    let matchedClass = '';
    for (const className of classes) {
      const hit = pickBestHit(classIndex.get(className) || []);
      if (!hit) continue;
      if (!best) {
        best = hit;
        matchedClass = className;
        // First successful candidate wins when order already prefers HTML / leaf classes.
        if (hit.kind === 'markup') break;
        continue;
      }
      if (best.kind !== 'markup' && hit.kind === 'markup') {
        best = hit;
        matchedClass = className;
        break;
      }
    }

    if (!best) {
      return {
        ...finding,
        target: {
          ...finding.target,
          sourceHint: `No source match for class(es): ${classes.slice(0, 4).join(', ')}`
        }
      };
    }

    const keepExistingSource = isLikelySourceFile(existingFile);
    return {
      ...finding,
      target: {
        ...finding.target,
        file: keepExistingSource ? existingFile : best.file,
        line: keepExistingSource && existingLine ? existingLine : best.line,
        sourceMatch: matchedClass,
        sourceKind: best.kind,
        sourceHint: best.kind === 'style'
          ? `Matched CSS class .${matchedClass} (style rule — check markup that uses it)`
          : `Matched class .${matchedClass} in source`
      }
    };
  });
}
