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

function walkFiles(root, predicate) {
  const matches = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    const relative = normalizeRelative(root, current);
    if (relative && shouldSkipDir(relative)) continue;

    let stat;
    try {
      stat = fs.statSync(current);
    } catch {
      continue;
    }

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

export function scanStylesheets(rootPath, options = {}) {
  const root = path.resolve(String(rootPath || process.cwd()));
  const maxInlineLines = Number(options.maxInlineLines ?? 15);
  const maxFileLines = Number(options.maxFileLines ?? 500);
  const minDuplicateRuleLines = Number(options.minDuplicateRuleLines ?? 4);

  const findings = [];
  const tokenDefinitions = new Map();
  const ruleFingerprints = new Map();

  const componentFiles = walkFiles(root, (filePath) =>
    COMPONENT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  );
  const stylesheetFiles = walkFiles(root, (filePath) =>
    STYLESHEET_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  );

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

  for (const [name, defs] of tokenDefinitions.entries()) {
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

  findings.sort((left, right) =>
    left.file.localeCompare(right.file) || left.line - right.line || left.label.localeCompare(right.label)
  );

  return {
    root,
    limits: { maxInlineLines, maxFileLines, minDuplicateRuleLines },
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
      duplicateRule: findings.filter((entry) => entry.category === 'duplicate-rule').length
    }
  };
}
