// ./Web_Toolkit/stylesheet_check/src/lib/scanner.mjs
/**
 * Stylesheet architecture scanner for Astro/Svelte/Vue/Tauri web UI projects.
 *
 * Enforces externalized CSS, token segregation, file size limits, and duplicate
 * custom-property definitions aligned with AGENTS.md stylesheet rules.
 */

import fs from 'node:fs';
import path from 'node:path';

const COMPONENT_EXTENSIONS = new Set(['.astro', '.svelte', '.vue']);
const STYLESHEET_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  '.astro',
  '.runtime',
  'coverage',
  '.wrangler',
  'output',
  '__pycache__'
]);

const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const CUSTOM_PROP_DEF_RE = /--([a-zA-Z0-9-_]+)\s*:\s*([^;{}]+);/g;

function normalizeRelative(root, target) {
  return path.relative(root, target).replace(/\\/g, '/');
}

function shouldSkipDir(relativePath) {
  if (!relativePath) return false;
  return relativePath.split('/').some((part) => SKIP_DIR_NAMES.has(part));
}

function isTokenFile(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  const base = path.basename(normalized);
  if (base === 'tokens.css' || base.endsWith('.tokens.css')) return true;
  if (normalized.includes('/styles/tokens/')) return true;
  if (normalized.includes('/styles/tokens.')) return true;
  return false;
}

function countMeaningfulLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('/*') && !line.startsWith('*') && line !== '*/')
    .length;
}

function isExcluded(relativePath, excludes) {
  if (!relativePath || excludes.length === 0) return false;
  return excludes.some((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`));
}

export function normalizeExcludes(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list
    .map((entry) => String(entry).trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''))
    .filter(Boolean);
}

function walkFiles(root, predicate, excludes = []) {
  const matches = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    const relative = normalizeRelative(root, current);
    if (relative && (shouldSkipDir(relative) || isExcluded(relative, excludes))) continue;

    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    // Symlinks (notably a project's Web_Toolkit link) are never followed: they would
    // pull toolkit source into a client scan and can form cycles.
    if (stat.isSymbolicLink()) continue;

    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        queue.push(path.join(current, entry));
      }
      continue;
    }

    if (predicate(current, relative)) matches.push(current);
  }
  return matches;
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function extractStyleBlocks(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const blocks = [];
  for (const match of content.matchAll(STYLE_BLOCK_RE)) {
    blocks.push({
      content: match[1],
      line: lineNumberAt(content, match.index)
    });
  }
  return blocks;
}

function extractCustomPropertyDefinitions(content, filePath, lineOffset = 1) {
  const definitions = [];
  for (const match of content.matchAll(CUSTOM_PROP_DEF_RE)) {
    definitions.push({
      name: match[1],
      value: String(match[2]).trim(),
      file: filePath,
      line: lineOffset + content.slice(0, match.index).split(/\r?\n/).length - 1
    });
  }
  return definitions;
}

function normalizeRuleBlock(block) {
  return block
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractRuleBlocks(content) {
  const blocks = [];
  const stripped = String(content || '').replace(/\/\*[\s\S]*?\*\//g, '');
  const ruleRe = /([^{}]+)\{([^{}]+)\}/g;
  for (const match of stripped.matchAll(ruleRe)) {
    const selector = match[1].trim();
    const body = match[2].trim();
    if (!selector || !body) continue;
    if (countMeaningfulLines(body) < 4) continue;
    blocks.push({
      selector,
      body,
      normalized: normalizeRuleBlock(`${selector}{${body}}`)
    });
  }
  return blocks;
}

function pushFinding(findings, entry) {
  findings.push(entry);
}

const TOKENS_FILE_IMPORT_RE = /@import\s+(?:url\()?\s*['"]?[^'")\s]*tokens\.css/;
const TOKENS_DIR_IMPORT_RE = /@import\s+(?:url\()?\s*['"]?[^'")\s]*tokens\/[^'")\s]*\.css/;

/** True when global.css (or, for a tokens/ folder, any top-level sheet such as critical.css) imports the tokens. */
function stylesImportTokens(stylesDir, globalPath, hasTokensDir) {
  const importsTokens = (text) => TOKENS_FILE_IMPORT_RE.test(text) || (hasTokensDir && TOKENS_DIR_IMPORT_RE.test(text));
  if (importsTokens(fs.readFileSync(globalPath, 'utf8'))) return true;
  if (!hasTokensDir) return false;
  return fs.readdirSync(stylesDir)
    .filter((name) => STYLESHEET_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .some((name) => importsTokens(fs.readFileSync(path.join(stylesDir, name), 'utf8')));
}

function checkAstroStyleArchitecture(root, findings) {
  const stylesDir = path.join(root, 'src', 'styles');
  if (!fs.existsSync(stylesDir)) return;

  const tokensPath = path.join(stylesDir, 'tokens.css');
  const globalPath = path.join(stylesDir, 'global.css');
  const tokensDir = path.join(stylesDir, 'tokens');
  const hasTokensFile = fs.existsSync(tokensPath);
  const hasTokensDir = fs.existsSync(tokensDir)
    && fs.statSync(tokensDir).isDirectory()
    && fs.readdirSync(tokensDir).some((name) => STYLESHEET_EXTENSIONS.has(path.extname(name).toLowerCase()));
  const hasTokens = hasTokensFile || hasTokensDir;
  const hasGlobal = fs.existsSync(globalPath);

  if (!hasTokens) {
    pushFinding(findings, {
      category: 'architecture',
      severity: 'error',
      file: 'src/styles/',
      line: 1,
      label: 'Missing tokens.css',
      excerpt: 'Create src/styles/tokens.css (or a src/styles/tokens/ folder of .css files) as the single custom-property source (Brand Guide → brand-doctor sync-tokens).'
    });
  }
  if (!hasGlobal) {
    pushFinding(findings, {
      category: 'architecture',
      severity: 'warn',
      file: 'src/styles/',
      line: 1,
      label: 'Missing global.css entry',
      excerpt: 'Prefer src/styles/global.css that @imports tokens then base/shared layers; import once from Layout.'
    });
  } else {
    if (hasTokens && !stylesImportTokens(stylesDir, globalPath, hasTokensDir)) {
      pushFinding(findings, {
        category: 'architecture',
        severity: 'warn',
        file: 'src/styles/global.css',
        line: 1,
        label: 'global.css does not import tokens.css',
        excerpt: 'Add `@import \"./tokens.css\";` (or equivalent) at the top of global.css, or import tokens from another top-level sheet such as critical.css.'
      });
    }
  }

  // Layout should import global.css once
  const layoutCandidates = [
    'src/layouts/Layout.astro',
    'src/layouts/BaseLayout.astro',
    'src/layouts/RootLayout.astro',
    'src/components/Layout.astro',
    'src/components/layout/BaseLayout.astro'
  ];
  let layoutImportsGlobal = false;
  let layoutFound = '';
  for (const relative of layoutCandidates) {
    const full = path.join(root, relative);
    if (!fs.existsSync(full)) continue;
    layoutFound = relative;
    const text = fs.readFileSync(full, 'utf8');
    if (/styles\/global\.css|['"]\.\.\/styles\/global\.css['"]|['"]@\/styles\/global\.css['"]/.test(text)) {
      layoutImportsGlobal = true;
      break;
    }
  }
  if (hasGlobal && layoutFound && !layoutImportsGlobal) {
    pushFinding(findings, {
      category: 'architecture',
      severity: 'warn',
      file: layoutFound,
      line: 1,
      label: 'Layout does not import global.css',
      excerpt: 'Import src/styles/global.css once from the root Layout (not from every page).'
    });
  } else if (hasGlobal && !layoutFound) {
    // soft: pages may import; warn only if no layout folder
    const layoutsDir = path.join(root, 'src', 'layouts');
    if (!fs.existsSync(layoutsDir)) {
      pushFinding(findings, {
        category: 'architecture',
        severity: 'warn',
        file: 'src/layouts/',
        line: 1,
        label: 'No Layout.astro found',
        excerpt: 'Add a root Layout that imports global.css once for stylesheet ownership.'
      });
    }
  }

  // Prefer segregated folders when styles grow
  const styleFiles = walkFiles(stylesDir, (filePath) => STYLESHEET_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
  if (styleFiles.length >= 6) {
    const hasComponents = fs.existsSync(path.join(stylesDir, 'components'));
    const hasLayout = fs.existsSync(path.join(stylesDir, 'layout'));
    if (!hasComponents && !hasLayout) {
      pushFinding(findings, {
        category: 'architecture',
        severity: 'warn',
        file: 'src/styles/',
        line: 1,
        label: 'Flat styles tree is growing',
        excerpt: `${styleFiles.length} stylesheets under src/styles/ — prefer layout/ + components/ + pages/ segregation.`
      });
    }
  }
}

export function scanStylesheets(rootPath, options = {}) {
  const root = path.resolve(String(rootPath || process.cwd()));
  let rootStat = null;
  try {
    rootStat = fs.statSync(root);
  } catch {
    // handled below
  }
  if (!rootStat?.isDirectory()) {
    throw new Error(`Scan root does not exist or is not a directory: ${root}`);
  }
  const maxInlineLines = Number(options.maxInlineLines ?? 15);
  const maxFileLines = Number(options.maxFileLines ?? 500);
  const minDuplicateRuleLines = Number(options.minDuplicateRuleLines ?? 4);
  const excludes = normalizeExcludes(options.exclude);

  const findings = [];
  const tokenDefinitions = new Map();
  const ruleFingerprints = new Map();

  checkAstroStyleArchitecture(root, findings);
  const componentFiles = walkFiles(root, (filePath) =>
    COMPONENT_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
  excludes);
  const stylesheetFiles = walkFiles(root, (filePath) =>
    STYLESHEET_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
  excludes);

  if (componentFiles.length === 0 && stylesheetFiles.length === 0) {
    pushFinding(findings, {
      category: 'scope',
      severity: 'warn',
      file: '.',
      line: 1,
      label: 'No component or stylesheet files found',
      excerpt: `Nothing to scan under ${root}. Check --root; an empty scan must not read as a clean result.`
    });
  }

  for (const filePath of componentFiles) {
    const relativePath = normalizeRelative(root, filePath);
    const blocks = extractStyleBlocks(filePath);
    if (blocks.length === 0) continue;

    for (const block of blocks) {
      const meaningfulLines = countMeaningfulLines(block.content);
      if (meaningfulLines > maxInlineLines) {
        pushFinding(findings, {
          category: 'inline-style',
          severity: 'error',
          file: relativePath,
          line: block.line,
          label: 'Inline style block exceeds limit',
          excerpt: `${meaningfulLines} meaningful lines (limit ${maxInlineLines}). Move styles to external CSS under src/styles/.`
        });
      }

      const defs = extractCustomPropertyDefinitions(block.content, relativePath, block.line);
      for (const def of defs) {
        if (!tokenDefinitions.has(def.name)) tokenDefinitions.set(def.name, []);
        tokenDefinitions.get(def.name).push(def);
        if (!isTokenFile(relativePath)) {
          pushFinding(findings, {
            category: 'token-placement',
            severity: 'error',
            file: relativePath,
            line: def.line,
            label: 'Custom property defined outside token file',
            excerpt: `--${def.name} should live in tokens.css (or styles/tokens/), not in component inline styles.`
          });
        }
      }

      for (const rule of extractRuleBlocks(block.content)) {
        if (rule.normalized.length < 40) continue;
        if (!ruleFingerprints.has(rule.normalized)) ruleFingerprints.set(rule.normalized, []);
        ruleFingerprints.get(rule.normalized).push({
          file: relativePath,
          line: block.line,
          selector: rule.selector
        });
      }
    }
  }

  for (const filePath of stylesheetFiles) {
    const relativePath = normalizeRelative(root, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const totalLines = content.split(/\r?\n/).length;
    const meaningfulLines = countMeaningfulLines(content);

    if (meaningfulLines > maxFileLines) {
      pushFinding(findings, {
        category: 'file-size',
        severity: 'error',
        file: relativePath,
        line: 1,
        label: 'Stylesheet exceeds line limit',
        excerpt: `${meaningfulLines} meaningful lines (limit ${maxFileLines}). Split into layout/components/pages layers.`
      });
    }

    const defs = extractCustomPropertyDefinitions(content, relativePath, 1);
    for (const def of defs) {
      if (!tokenDefinitions.has(def.name)) tokenDefinitions.set(def.name, []);
      tokenDefinitions.get(def.name).push(def);
      if (!isTokenFile(relativePath)) {
        pushFinding(findings, {
          category: 'token-placement',
          severity: 'error',
          file: relativePath,
          line: def.line,
          label: 'Custom property defined outside token file',
          excerpt: `--${def.name} should be centralized in tokens.css (or styles/tokens/).`
        });
      }
    }

    for (const rule of extractRuleBlocks(content)) {
      if (countMeaningfulLines(rule.body) < minDuplicateRuleLines) continue;
      if (!ruleFingerprints.has(rule.normalized)) ruleFingerprints.set(rule.normalized, []);
      ruleFingerprints.get(rule.normalized).push({
        file: relativePath,
        line: 1,
        selector: rule.selector
      });
    }
  }

  for (const [name, allDefs] of tokenDefinitions.entries()) {
    // Theme variants (src/styles/themes/<name>/tokens.css) redefine the same names on purpose, each scoped by
    // :root[data-theme="<name>"]. They are alternatives to the default, not duplicates of it.
    const defs = allDefs.filter((entry) => !/(^|\/)themes\//.test(entry.file));
    const files = [...new Set(defs.map((entry) => entry.file))];
    if (files.length <= 1) continue;
    const values = [...new Set(defs.map((entry) => entry.value))];
    pushFinding(findings, {
      category: 'duplicate-token',
      severity: 'error',
      file: files[0],
      line: defs[0].line,
      label: 'Duplicate custom property name across files',
      excerpt: `--${name} is defined in ${files.length} files (${files.join(', ')}${values.length > 1 ? '; conflicting values' : ''}). Keep one token source.`
    });
  }

  for (const [fingerprint, locations] of ruleFingerprints.entries()) {
    const uniqueFiles = [...new Set(locations.map((entry) => entry.file))];
    if (uniqueFiles.length < 2) continue;
    pushFinding(findings, {
      category: 'duplicate-rule',
      severity: 'warn',
      file: locations[0].file,
      line: locations[0].line,
      label: 'Duplicate CSS rule block across files',
      excerpt: `Same rule appears in ${uniqueFiles.length} files (e.g. ${locations[0].selector.trim()}). Extract to a shared external stylesheet.`
    });
  }

  checkMotionGuards(root, stylesheetFiles, findings);

  findings.sort((left, right) =>
    left.file.localeCompare(right.file) || left.line - right.line || left.label.localeCompare(right.label)
  );

  return {
    root,
    limits: { maxInlineLines, maxFileLines, minDuplicateRuleLines },
    excluded: excludes,
    scanned: {
      componentFiles: componentFiles.length,
      stylesheetFiles: stylesheetFiles.length
    },
    findings,
    summary: {
      total: findings.length,
      errors: findings.filter((entry) => entry.severity === 'error').length,
      warnings: findings.filter((entry) => entry.severity === 'warn').length,
      inlineStyle: findings.filter((entry) => entry.category === 'inline-style').length,
      fileSize: findings.filter((entry) => entry.category === 'file-size').length,
      tokenPlacement: findings.filter((entry) => entry.category === 'token-placement').length,
      duplicateToken: findings.filter((entry) => entry.category === 'duplicate-token').length,
      duplicateRule: findings.filter((entry) => entry.category === 'duplicate-rule').length,
      architecture: findings.filter((entry) => entry.category === 'architecture').length,
      motionGuard: findings.filter((entry) => entry.category === 'motion-reduced-guard').length
    }
  };
}

/**
 * Motion policy guard: effects that a global `animation-duration` reset cannot switch off must be gated in their own
 * file by `prefers-reduced-motion`. Scroll-driven animations ignore duration, and View Transitions are not CSS animations
 * on the page, so each needs an explicit `no-preference` wrapper or a `reduce` override.
 */
function checkMotionGuards(root, stylesheetFiles, findings) {
  const lineOf = (text, index) => text.slice(0, index).split('\n').length;
  for (const filePath of stylesheetFiles) {
    const text = fs.readFileSync(filePath, 'utf8');
    const relativePath = normalizeRelative(root, filePath);
    const guarded = /prefers-reduced-motion/.test(text);
    const timeline = text.search(/animation-timeline\s*:/);
    if (timeline !== -1 && !guarded) {
      pushFinding(findings, {
        category: 'motion-reduced-guard',
        severity: 'error',
        file: relativePath,
        line: lineOf(text, timeline),
        label: 'Scroll-driven animation without a reduced-motion guard',
        excerpt: 'animation-timeline ignores animation-duration resets. Wrap it in @media (prefers-reduced-motion: no-preference) or add a reduce override.'
      });
    }
    const viewTransition = text.search(/@view-transition\b/);
    if (viewTransition !== -1 && !guarded) {
      pushFinding(findings, {
        category: 'motion-reduced-guard',
        severity: 'error',
        file: relativePath,
        line: lineOf(text, viewTransition),
        label: '@view-transition without a reduced-motion guard',
        excerpt: 'Wrap @view-transition in @media (prefers-reduced-motion: no-preference) so reduced-motion visitors navigate without a transition.'
      });
    }
  }
}
