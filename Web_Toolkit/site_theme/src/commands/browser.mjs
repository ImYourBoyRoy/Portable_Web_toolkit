// ./Web_Toolkit/site_theme/src/commands/browser.mjs
/** extract and compare: the commands that need a rendered page (Playwright from the project). */

import fs from 'node:fs';
import path from 'node:path';
import { parseRoutes, resolveBase, slugForRoute, withBrowser } from '../../../preview_check/src/lib/browser.mjs';
import { loadContract, validateTokens } from '../lib/contract.mjs';
import { deriveTokens, normalizeMap, suggestMapByValue } from '../lib/derive.mjs';
import { renderContactSheet } from '../lib/html.mjs';
import { writeTheme } from '../lib/theme-files.mjs';
import { findTheme, loadProjectMap, MAP_FILE, themeSources } from './themes.mjs';
import { listThemes } from '../lib/theme-files.mjs';

/** Runs in the page: raw measurements only; all decisions are made in derive.mjs. */
function collectSamples() {
  const first = (selector) => document.querySelector(selector);
  const style = (el) => getComputedStyle(el);
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = style(el); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const many = (selector, limit = 200) => [...document.querySelectorAll(selector)].filter(visible).slice(0, limit);
  const body = document.body;
  const bodyBg = style(body).backgroundColor !== 'rgba(0, 0, 0, 0)' ? style(body).backgroundColor : style(document.documentElement).backgroundColor;
  const rootVars = [];
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) walk(rule.cssRules);
      if (rule.selectorText === ':root' || rule.selectorText === 'html') for (const name of rule.style) if (name.startsWith('--') && !rootVars.includes(name)) rootVars.push(name);
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch { /* cross-origin stylesheet */ }
  }
  const computedRoot = getComputedStyle(document.documentElement);
  const rootVarValues = Object.fromEntries(rootVars.map((name) => [name, computedRoot.getPropertyValue(name).trim()]));
  const heading = first('h1') ?? first('h2');
  const code = first('code, pre');
  return {
    bodyBg,
    bodyColor: style(body).color,
    surfaceBgs: many('main section, article, aside, header, footer, nav, [class*="card"], [class*="panel"]').map((el) => style(el).backgroundColor),
    mutedColors: many('small, figcaption, [class*="muted"], [class*="caption"], [class*="sub"], footer p').map((el) => style(el).color),
    linkColors: many('main a, article a, p a').map((el) => style(el).color),
    buttonBgs: many('button, .button, [class*="btn"], a[class*="button"], a[class*="cta"]').map((el) => style(el).backgroundColor),
    borderColors: many('[class*="card"], hr, input, header, footer, table, td, th').map((el) => style(el).borderTopColor).filter((c) => c !== 'rgba(0, 0, 0, 0)'),
    fonts: { display: heading ? style(heading).fontFamily : '', sans: style(body).fontFamily, mono: code ? style(code).fontFamily : '' },
    radii: many('button, .button, [class*="card"], input').map((el) => style(el).borderTopLeftRadius).filter((value) => /px/.test(value)).map((value) => value.replace('px', '')),
    rootVars,
    rootVarValues
  };
}

export async function runExtract(flags, log) {
  const projectRoot = path.resolve(flags['project-root'] || '.');
  const base = resolveBase(flags);
  const routes = parseRoutes(flags.routes);
  const name = String(flags.name || new URL(base).hostname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'extracted').toLowerCase();
  const scheme = String(flags.scheme || 'light');
  const merged = { surfaceBgs: [], mutedColors: [], linkColors: [], buttonBgs: [], borderColors: [], radii: [], rootVars: new Set(), rootVarValues: {} };
  let first = null;
  await withBrowser(projectRoot, async (browser) => {
    const context = await browser.newContext({ viewport: { width: Number(flags.width || 1440), height: 900 }, colorScheme: scheme });
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(`${base}${route}`, { waitUntil: 'load' });
      await page.waitForTimeout(Number(flags['settle-ms'] || 600));
      const samples = await page.evaluate(collectSamples);
      first ??= samples;
      for (const key of ['surfaceBgs', 'mutedColors', 'linkColors', 'buttonBgs', 'borderColors', 'radii']) merged[key].push(...samples[key]);
      samples.rootVars.forEach((variable) => merged.rootVars.add(variable));
      Object.assign(merged.rootVarValues, samples.rootVarValues);
    }
    await context.close();
  });
  const derived = deriveTokens({ ...first, ...Object.fromEntries(Object.entries(merged).filter(([key]) => key !== 'rootVars' && key !== 'rootVarValues')) });
  const result = validateTokens(derived.tokens, loadContract());
  const outDir = path.resolve(flags.out || path.join(projectRoot, 'output', 'site-theme', name));
  const meta = { name, label: String(flags.label || name), scheme: derived.scheme, description: `Extracted from ${base} (${routes.join(', ')}). Draft: review values marked derived/defaulted in sources.`, source: base, sources: derived.how };
  writeTheme(outDir, meta, derived.tokens, `${name}: extracted draft from ${base}`);
  const mapping = suggestMapByValue(merged.rootVarValues, derived.tokens, derived.how);
  if (Object.keys(mapping).length > 0) fs.writeFileSync(path.join(outDir, 'theme-map.suggested.json'), `${JSON.stringify(mapDocument(name, mapping, merged.rootVars), null, 2)}\n`, 'utf8');
  const counts = Object.values(derived.how).reduce((acc, source) => ({ ...acc, [source]: (acc[source] ?? 0) + 1 }), {});
  log(`extracted ${name} (${derived.scheme}) -> ${path.relative(projectRoot, outDir) || outDir}\n`);
  log(`tokens: ${Object.entries(counts).map(([key, count]) => `${count} ${key}`).join(', ')} | contract: ${result.errors.length === 0 ? 'AA ok' : result.errors.join('; ')}\n`);
  log(`site custom properties found: ${merged.rootVars.size}${Object.keys(mapping).length ? ` | suggested map: ${Object.keys(mapping).length} roles (theme-map.suggested.json, use with compare --map)` : ''}\n`);
  log('Next: site-theme apply --source output/site-theme ' + name + '  (after reviewing tokens.css)\n');
  return result.errors.length === 0 ? 0 : 2;
}

function mapDocument(site, mapping, allVars) {
  const roles = Object.fromEntries(Object.entries(mapping).map(([role, name]) => [role, [name]]));
  const used = new Set(Object.values(mapping));
  return { schemaVersion: 1, site, note: 'Review before use. Roles are matched by resolved value (a variable equal to the measured color) and by name; the site keeps its own variable names, and apply writes compat.css pointing them at the theme.', map: roles, unmapped: [...allVars].filter((name) => !used.has(name)) };
}

/** site-theme map init: scan a running site and write src/styles/themes/theme-map.json (the link between its variables and the contract). */
export async function runMapInit(flags, log) {
  const projectRoot = path.resolve(flags['project-root'] || '.');
  const base = resolveBase(flags);
  const routes = parseRoutes(flags.routes);
  const target = path.join(projectRoot, MAP_FILE);
  if (fs.existsSync(target) && flags.force !== true) throw new Error(`${path.relative(projectRoot, target)} already exists; review it, or pass --force to regenerate`);
  const merged = { surfaceBgs: [], mutedColors: [], linkColors: [], buttonBgs: [], borderColors: [], radii: [], rootVars: new Set(), rootVarValues: {} };
  let first = null;
  await withBrowser(projectRoot, async (browser) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: String(flags.scheme || 'light') });
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(`${base}${route}`, { waitUntil: 'load' });
      await page.waitForTimeout(Number(flags['settle-ms'] || 600));
      const samples = await page.evaluate(collectSamples);
      first ??= samples;
      for (const key of ['surfaceBgs', 'mutedColors', 'linkColors', 'buttonBgs', 'borderColors', 'radii']) merged[key].push(...samples[key]);
      samples.rootVars.forEach((variable) => merged.rootVars.add(variable));
      Object.assign(merged.rootVarValues, samples.rootVarValues);
    }
    await context.close();
  });
  const derived = deriveTokens({ ...first, surfaceBgs: merged.surfaceBgs, mutedColors: merged.mutedColors, linkColors: merged.linkColors, buttonBgs: merged.buttonBgs, borderColors: merged.borderColors, radii: merged.radii });
  const mapping = suggestMapByValue(merged.rootVarValues, derived.tokens, derived.how);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(mapDocument(path.basename(projectRoot), mapping, merged.rootVars), null, 2)}\n`, 'utf8');
  const missing = Object.keys(derived.tokens).filter((role) => (role.startsWith('--color-') || role.startsWith('--font-')) && !(role in mapping));
  log(`wrote ${path.relative(projectRoot, target)}: ${Object.keys(mapping).length} roles mapped from ${merged.rootVars.size} site variables\n`);
  if (missing.length > 0) log(`no site variable found for: ${missing.join(', ')} (add them to the map by hand, or the theme cannot drive those roles)\n`);
  log('Review it, then: site-theme apply <theme> (writes compat.css) or site-theme compare --all (uses this map automatically)\n');
  return 0;
}

/** In-page: count visible text nodes whose color fails 4.5:1 against the nearest solid ancestor background. */
function countLowContrastText() {
  const parse = (value) => { const m = /rgba?\(([^)]+)\)/.exec(value); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[,/ ]+/).filter(Boolean).map(Number); return [r, g, b, a]; };
  const lum = ([r, g, b]) => { const c = (v) => { const u = v / 255; return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); };
  let failures = 0;
  let checked = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const el = node.parentElement;
    if (!node.textContent.trim() || !el || seen.has(el) || el.closest('script,style,noscript')) continue;
    seen.add(el);
    const rect = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (rect.width < 2 || rect.height < 2 || st.visibility === 'hidden' || Number(st.opacity) < 0.5 || st.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue;
    let bg = null;
    let hard = false;
    for (let cursor = el; cursor; cursor = cursor.parentElement) {
      const cs = getComputedStyle(cursor);
      if (cs.backgroundImage !== 'none') { hard = true; break; }
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0.95) { bg = c; break; }
    }
    if (hard) continue;
    bg ??= [255, 255, 255, 1];
    const fg = parse(st.color);
    if (!fg) continue;
    checked += 1;
    const size = Number.parseFloat(st.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(st.fontWeight) >= 700);
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    if ((hi + 0.05) / (lo + 0.05) < (large ? 3 : 4.5)) failures += 1;
  }
  return { failures, checked };
}

export async function runCompare(flags, log) {
  const projectRoot = path.resolve(flags['project-root'] || '.');
  const base = resolveBase(flags);
  const routes = parseRoutes(flags.routes);
  const sources = themeSources(projectRoot, [].concat(flags.source ?? []));
  const names = flags.all === true
    ? [...new Set(sources.flatMap((source) => listThemes(source).map((theme) => theme.meta.name)))]
    : String(flags.themes || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (names.length < 1) throw new Error('compare needs --themes a,b,c (or --all). See `site-theme list`.');
  const themes = names.map((name) => findTheme(name, sources));
  const map = loadProjectMap(projectRoot, flags.map).map;
  const outDir = path.resolve(flags.out || path.join(projectRoot, 'output', 'site-theme', 'compare'));
  fs.mkdirSync(outDir, { recursive: true });
  const width = Number(flags.width || 1440);
  const results = {};
  const rows = routes.map((route) => ({ route, files: {} }));

  await withBrowser(projectRoot, async (browser) => {
    for (const theme of themes) {
      const css = `${theme.css}\n${Object.entries(map).flatMap(([role, vars]) => vars.map((siteVar) => `:root[data-theme="${theme.meta.name}"] { ${siteVar}: var(${role}); }`)).join('\n')}`;
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme.meta.scheme });
      const page = await context.newPage();
      let baselineBg = null;
      let totalFailures = 0;
      for (const [index, route] of routes.entries()) {
        await page.goto(`${base}${route}`, { waitUntil: 'load' });
        await page.waitForTimeout(Number(flags['settle-ms'] || 600));
        if (index === 0) baselineBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        await page.evaluate(({ stylesheet, name }) => {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(stylesheet);
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
          document.documentElement.setAttribute('data-theme', name);
        }, { stylesheet: css, name: theme.meta.name });
        await page.waitForTimeout(150);
        if (index === 0) {
          const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
          results[theme.meta.name] = { afterBackground: after, baselineBackground: baselineBg };
        }
        const { failures } = await page.evaluate(countLowContrastText);
        totalFailures += failures;
        const file = `${theme.meta.name}-${slugForRoute(route)}.png`;
        await page.screenshot({ path: path.join(outDir, file), fullPage: flags['full-page'] === true, animations: 'disabled' });
        rows[index].files[theme.meta.name] = file;
      }
      results[theme.meta.name] = { ...results[theme.meta.name], textFailures: totalFailures };
      await context.close();
    }
  });
  // "Does the site read the tokens?" Several themes must be able to produce different page backgrounds. A theme that is
  // already the active default (or the scheme's pair) legitimately changes nothing, so compare themes with each other;
  // with a single theme fall back to before/after.
  const backgrounds = new Set(themes.map((theme) => results[theme.meta.name].afterBackground));
  for (const theme of themes) {
    const entry = results[theme.meta.name];
    entry.siteReadsTokens = themes.length > 1 ? backgrounds.size > 1 : entry.afterBackground !== entry.baselineBackground;
  }
  fs.writeFileSync(path.join(outDir, 'index.html'), renderContactSheet({ site: base, routes: rows, themes, results }), 'utf8');
  fs.writeFileSync(path.join(outDir, 'compare.json'), `${JSON.stringify({ base, routes, themes: themes.map((t) => t.meta.name), results }, null, 1)}\n`, 'utf8');
  log(`compared ${themes.length} theme(s) x ${routes.length} route(s) -> ${path.relative(projectRoot, outDir) || outDir}/index.html\n`);
  for (const theme of themes) {
    const r = results[theme.meta.name];
    log(`${theme.meta.name.padEnd(14)} ${theme.meta.scheme.padEnd(6)} low-contrast text: ${r.textFailures}${r.siteReadsTokens === false ? '  (page background did not change: site does not read the tokens; pass --map)' : ''}\n`);
  }
  return 0;
}
