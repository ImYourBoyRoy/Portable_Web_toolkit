// ./Web_Toolkit/site_theme/src/commands/themes.mjs
/** list, validate, apply: everything that works on theme folders without a browser. */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadContract, requiredTokens, validateTokens, TEMPLATE_ROOT } from '../lib/contract.mjs';
import { buildCompatCss, normalizeMap } from '../lib/derive.mjs';
import { listThemes, readTheme, writeTheme } from '../lib/theme-files.mjs';

export const BUNDLED_THEMES = path.join(TEMPLATE_ROOT, 'themes');
export const COMPONENT_FILES = ['ThemeInit.astro', 'ThemeToggle.astro', 'ThemePicker.astro'];

/** Your own exported themes (for example "nomos") live outside every repo so any site can use them. */
export function libraryDir() {
  return path.resolve(process.env.PORTABLE_TOOLKIT_THEMES || path.join(os.homedir(), '.portable-web-toolkit', 'themes'));
}

export function themeSources(projectRoot, extra = []) {
  return [...new Set([path.join(projectRoot, 'src', 'styles', 'themes'), ...extra.map((dir) => path.resolve(dir)), libraryDir(), path.join(projectRoot, 'output', 'site-theme'), BUNDLED_THEMES])];
}

export const MAP_FILE = path.join('src', 'styles', 'themes', 'theme-map.json');

export function loadProjectMap(projectRoot, file) {
  const target = file ? path.resolve(String(file)) : path.join(projectRoot, MAP_FILE);
  if (!fs.existsSync(target)) return { map: {}, file: null };
  return { map: normalizeMap(JSON.parse(fs.readFileSync(target, 'utf8')), requiredTokens(loadContract())), file: target };
}

/** site-theme export <name> [--as <new-name>] [--label <text>]: copy a theme into your library so any site can apply it. */
export function runExport(positionals, flags, log) {
  const projectRoot = path.resolve(flags['project-root'] || '.');
  const [name] = positionals;
  if (!name) throw new Error('export needs a theme name or folder (for example the output/site-theme/<site> an extract produced)');
  const theme = findTheme(name, themeSources(projectRoot, [].concat(flags.source ?? [])));
  const exportName = String(flags.as || theme.meta.name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  if (!exportName) throw new Error('--as must contain letters or digits');
  const result = validateTokens(theme.tokens, loadContract());
  if (result.errors.length > 0 && flags['allow-contrast-failures'] !== true) throw new Error(`${theme.meta.name} fails the token contract: ${result.errors.join('; ')} (fix it, or pass --allow-contrast-failures)`);
  const target = path.join(libraryDir(), exportName);
  if (fs.existsSync(target) && flags.force !== true) throw new Error(`${target} already exists; pass --force to overwrite`);
  const meta = { ...theme.meta, name: exportName, label: String(flags.label || (flags.as ? exportName : theme.meta.label ?? exportName)), exportedAt: new Date().toISOString(), exportedFrom: theme.meta.source ?? path.relative(projectRoot, theme.directory) };
  writeTheme(target, meta, theme.tokens, `${meta.label}: exported ${meta.exportedAt.slice(0, 10)} from ${meta.exportedFrom}`);
  log(`exported ${exportName} (${meta.scheme}) -> ${target}\nUse it anywhere: site-theme apply ${exportName} --project-root <site>   |   site-theme compare --themes ${exportName} --url <preview>\n`);
  return 0;
}

export function findTheme(name, sources) {
  for (const source of sources) {
    const candidate = path.join(source, name);
    if (fs.existsSync(path.join(candidate, 'theme.json'))) return readTheme(candidate);
  }
  if (fs.existsSync(path.join(name, 'theme.json'))) return readTheme(path.resolve(name));
  throw new Error(`Theme "${name}" not found. Looked in: ${sources.join(', ')}`);
}

export function runList(flags, log) {
  const projectRoot = path.resolve(flags['project-root'] || '.');
  const contract = loadContract();
  let count = 0;
  for (const source of themeSources(projectRoot, [].concat(flags.source ?? []))) {
    for (const theme of listThemes(source)) {
      const result = validateTokens(theme.tokens, contract);
      log(`${theme.meta.name.padEnd(14)} ${theme.meta.scheme.padEnd(6)} ${result.errors.length === 0 ? 'AA ok' : `${result.errors.length} problem(s)`}  ${path.relative(projectRoot, theme.directory) || theme.directory}\n`);
      count += 1;
    }
  }
  if (count === 0) log('no themes found\n');
  return 0;
}

export function runValidate(positionals, flags, log) {
  const projectRoot = path.resolve(flags['project-root'] || '.');
  const contract = loadContract();
  if (positionals.length === 0) throw new Error('validate needs a theme name or folder');
  let failed = 0;
  for (const target of positionals) {
    const theme = findTheme(target, themeSources(projectRoot, [].concat(flags.source ?? [])));
    const result = validateTokens(theme.tokens, contract);
    log(`${theme.meta.name}: ${result.errors.length === 0 ? 'ok' : 'FAIL'} (${result.contrast.filter((c) => c.ok).length}/${result.contrast.length} contrast pairs pass)\n`);
    for (const error of result.errors) log(`  ${error}\n`);
    failed += result.errors.length > 0 ? 1 : 0;
  }
  return failed > 0 ? 2 : 0;
}

/** Install themes into a project: tokens, an index of imports, a data file for the layout, and the toggle components. */
export function runApply(positionals, flags, log) {
  const projectRoot = path.resolve(flags['project-root'] || '.');
  const names = positionals.length > 0 ? positionals : (flags.all === true ? listThemes(BUNDLED_THEMES).map((theme) => theme.meta.name) : []);
  if (names.length === 0) throw new Error('apply needs theme names (or --all). See `site-theme list`.');
  const contract = loadContract();
  const sources = themeSources(projectRoot, [].concat(flags.source ?? []));
  const installed = names.map((name) => findTheme(name, sources));
  for (const theme of installed) {
    const result = validateTokens(theme.tokens, contract);
    if (result.errors.length > 0 && flags['allow-contrast-failures'] !== true) {
      throw new Error(`${theme.meta.name} fails the token contract: ${result.errors.join('; ')} (fix it, or pass --allow-contrast-failures)`);
    }
  }

  const themesDir = path.join(projectRoot, 'src', 'styles', 'themes');
  fs.mkdirSync(themesDir, { recursive: true });
  const existing = listThemes(themesDir).map((theme) => theme.meta);
  const all = new Map(existing.map((meta) => [meta.name, meta]));
  for (const theme of installed) {
    const target = path.join(themesDir, theme.meta.name);
    if (path.resolve(theme.directory) !== path.resolve(target)) {
      fs.mkdirSync(target, { recursive: true });
      fs.copyFileSync(path.join(theme.directory, 'theme.json'), path.join(target, 'theme.json'));
      fs.copyFileSync(path.join(theme.directory, 'tokens.css'), path.join(target, 'tokens.css'));
    }
    all.set(theme.meta.name, theme.meta);
    log(`installed ${theme.meta.name} (${theme.meta.scheme})\n`);
  }

  const available = [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (flags.map) fs.copyFileSync(path.resolve(String(flags.map)), path.join(themesDir, 'theme-map.json'));
  const { map, file: mapFile } = loadProjectMap(projectRoot);
  const mappedRoles = Object.keys(map).length;
  if (mappedRoles > 0) fs.writeFileSync(path.join(themesDir, 'compat.css'), buildCompatCss(map, path.basename(projectRoot)), 'utf8');
  fs.writeFileSync(path.join(themesDir, 'index.css'), `/* Generated by site-theme apply. Import once, e.g. in your global stylesheet: @import './themes/index.css'; */\n${available.map((meta) => `@import './${meta.name}/tokens.css';`).join('\n')}${mappedRoles > 0 ? "\n@import './compat.css';" : ''}\n`, 'utf8');

  const dataFile = path.join(projectRoot, 'src', 'data', 'themes.json');
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch { /* first install */ }
  const pairFlag = typeof flags.pair === 'string' ? flags.pair.split(',').map((item) => item.trim()) : null;
  const firstOf = (scheme) => available.find((meta) => meta.scheme === scheme)?.name;
  const pair = pairFlag ? { light: pairFlag[0], dark: pairFlag[1] } : { light: previous.pair?.light ?? firstOf('light'), dark: previous.pair?.dark ?? firstOf('dark') };
  const names2 = new Set(available.map((meta) => meta.name));
  for (const value of Object.values(pair)) if (value && !names2.has(value)) throw new Error(`--pair names an unknown theme: ${value}`);
  const chosenDefault = typeof flags.default === 'string' ? flags.default : (previous.default ?? pair.light ?? available[0]?.name);
  if (!names2.has(chosenDefault)) throw new Error(`--default names an unknown theme: ${chosenDefault}`);
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, `${JSON.stringify({ default: chosenDefault, pair, available: available.map(({ name, label, scheme }) => ({ name, label: label ?? name, scheme })) }, null, 2)}\n`, 'utf8');

  const componentsDir = path.join(projectRoot, 'src', 'components', 'theme');
  fs.mkdirSync(componentsDir, { recursive: true });
  for (const file of COMPONENT_FILES) {
    const target = path.join(componentsDir, file);
    if (!fs.existsSync(target) || flags.force === true) fs.copyFileSync(path.join(TEMPLATE_ROOT, file), target);
  }

  log([
    `default=${chosenDefault} light=${pair.light ?? '-'} dark=${pair.dark ?? '-'} | ${available.length} theme(s) in src/styles/themes | compat map: ${mappedRoles > 0 ? `${mappedRoles} roles from ${path.relative(projectRoot, mapFile)}` : 'none (components must read the contract tokens; run site-theme map init to link an existing site)'}`,
    'Wire it once in your layout:',
    "  import themes from '../data/themes.json';  import ThemeInit from '../components/theme/ThemeInit.astro';",
    '  <html data-theme={themes.default}>, <ThemeInit /> first in <head> (before stylesheets), <ThemeToggle /> or <ThemePicker /> in the header',
    "  global stylesheet: @import './themes/index.css';  components must read var(--color-*) / var(--font-*) from the contract"
  ].join('\n') + '\n');
  return 0;
}
