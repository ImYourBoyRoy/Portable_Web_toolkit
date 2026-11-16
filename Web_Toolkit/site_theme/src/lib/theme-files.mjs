// ./Web_Toolkit/site_theme/src/lib/theme-files.mjs
/**
 * A theme is a folder: theme.json (name, label, scheme, description, source) and tokens.css, which declares every
 * contract token under :root[data-theme="<name>"]. Reading/writing that CSS is all the tooling needs.
 */

import fs from 'node:fs';
import path from 'node:path';

export function parseTokensCss(css, name) {
  const tokens = {};
  const selector = new RegExp(`:root\\[data-theme=["']?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\]\\s*\\{([^}]*)\\}`);
  const block = selector.exec(css)?.[1] ?? '';
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}

export function renderTokensCss(name, tokens, { scheme = 'light', header = '' } = {}) {
  const lines = Object.entries(tokens).map(([key, value]) => `  ${key}: ${value};`);
  return `${header ? `/* ${header} */\n` : ''}:root[data-theme="${name}"] {\n  color-scheme: ${scheme};\n${lines.join('\n')}\n}\n`;
}

export function readTheme(directory) {
  const meta = JSON.parse(fs.readFileSync(path.join(directory, 'theme.json'), 'utf8'));
  const css = fs.readFileSync(path.join(directory, 'tokens.css'), 'utf8');
  return { directory, meta, css, tokens: parseTokensCss(css, meta.name) };
}

export function writeTheme(directory, meta, tokens, header) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'theme.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(directory, 'tokens.css'), renderTokensCss(meta.name, tokens, { scheme: meta.scheme, header }), 'utf8');
}

export function listThemes(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'theme.json')))
    .map((entry) => readTheme(path.join(root, entry.name)));
}
