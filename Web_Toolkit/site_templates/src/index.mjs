// ./Web_Toolkit/site_templates/src/index.mjs
/**
 * Installs template folders (templates/<name>/template.json) into a site: file copies to the right destinations, CSS imports,
 * and the follow-up steps, instead of a model re-reading copy tables and doing it by hand. Dry-run unless apply is set.
 *
 * Safety: never overwrites a file that differs unless force; `keepExisting` files (data/config examples) are never replaced;
 * destinations must stay inside the project; manual prerequisites (discovery) are reported, not guessed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEMPLATES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates');

export function loadManifests(root = TEMPLATES_ROOT) {
  const manifests = new Map();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name, 'template.json');
    if (!entry.isDirectory() || !fs.existsSync(file)) continue;
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    // `source` lets a small manifest (contact-intake) install files that live inside another template's folder.
    manifests.set(manifest.name, { ...manifest, directory: path.join(root, manifest.source || entry.name), manifestDirectory: path.join(root, entry.name) });
  }
  return manifests;
}

/** Order with prerequisites first; unknown names are an error. */
export function resolveOrder(names, manifests) {
  const order = [];
  const visiting = new Set();
  const visit = (name) => {
    if (order.includes(name)) return;
    const manifest = manifests.get(name);
    if (!manifest) throw new Error(`Unknown template "${name}". Available: ${[...manifests.keys()].sort().join(', ')}`);
    if (visiting.has(name)) throw new Error(`Template requirement cycle at ${name}`);
    visiting.add(name);
    for (const required of manifest.requires ?? []) visit(required);
    visiting.delete(name);
    order.push(name);
  };
  names.forEach(visit);
  return order;
}

function expandFrom(directory, pattern) {
  const dir = path.dirname(pattern);
  const base = path.basename(pattern);
  const folder = path.join(directory, dir === '.' ? '' : dir);
  if (!base.includes('*')) return fs.existsSync(path.join(directory, pattern)) ? [pattern] : [];
  if (!fs.existsSync(folder)) return [];
  const regex = new RegExp(`^${base.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return fs.readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isFile() && regex.test(entry.name)).map((entry) => (dir === '.' ? entry.name : `${dir}/${entry.name}`)).sort();
}

/** Same bytes, or the same text apart from CRLF vs LF (a Windows checkout with autocrlf must not make every file "differ"). */
function sameContent(left, right) {
  if (left.equals(right)) return true;
  if (left.includes(0) || right.includes(0)) return false;
  const text = (buffer) => buffer.toString('utf8').replace(/\r\n/g, '\n');
  return text(left) === text(right);
}

function inside(projectRoot, target) {
  const relative = path.relative(projectRoot, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** @returns {{ order: string[], actions: Array<{ template: string, from: string, to: string, status: 'new'|'same'|'differs'|'kept' }>, cssImports: string[], next: Array<{ template: string, text: string }>, manual: string[], env: string[] }} */
export function planInstall(projectRoot, names, { manifests = loadManifests(), force = false } = {}) {
  const order = resolveOrder(names, manifests);
  const actions = [];
  const next = [];
  const manual = [];
  const env = [];
  const cssImports = [];
  for (const name of order) {
    const manifest = manifests.get(name);
    if (manifest.manual && !names.includes(name)) manual.push(`${name}: ${manifest.manual}`);
    for (const rule of manifest.files ?? []) {
      for (const match of expandFrom(manifest.directory, rule.from)) {
        const source = path.join(manifest.directory, match);
        const toDirectory = rule.to.endsWith('/');
        const destination = path.resolve(projectRoot, toDirectory ? path.join(rule.to, path.basename(match)) : rule.to);
        if (!inside(projectRoot, destination)) throw new Error(`${name}: destination escapes the project: ${rule.to}`);
        let status = 'new';
        if (fs.existsSync(destination)) {
          const same = sameContent(fs.readFileSync(source), fs.readFileSync(destination));
          status = same ? 'same' : (rule.keepExisting && !force ? 'kept' : (force ? 'new' : 'differs'));
        }
        actions.push({ template: name, from: path.relative(TEMPLATES_ROOT, source).split(path.sep).join('/'), to: path.relative(projectRoot, destination).split(path.sep).join('/'), status, source, destination });
      }
    }
    cssImports.push(...(manifest.cssImports ?? []));
    env.push(...(manifest.env ?? []));
    for (const text of manifest.next ?? []) next.push({ template: name, text });
  }
  return { order, actions, cssImports: [...new Set(cssImports)], next, manual, env: [...new Set(env)] };
}

/** @import must precede every other rule: insert after the last leading @import (or after the leading comment). */
export function insertImport(css, target) {
  const eol = css.includes('\r\n') ? '\r\n' : '\n';
  const lines = css.split(/\r?\n/);
  let afterComment = 0;
  let lastImport = -1;
  let inComment = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (inComment) { if (line.includes('*/')) { inComment = false; afterComment = index + 1; } continue; }
    if (line.startsWith('/*')) { inComment = !line.includes('*/'); if (!inComment) afterComment = index + 1; continue; }
    if (line.startsWith('@import') || line.startsWith('@charset')) { lastImport = index; continue; }
    if (line === '') continue;
    break;
  }
  lines.splice(lastImport >= 0 ? lastImport + 1 : afterComment, 0, `@import '${target}';`);
  return lines.join(eol);
}

export function applyInstall(projectRoot, plan) {
  const written = [];
  for (const action of plan.actions) {
    if (action.status !== 'new') continue;
    fs.mkdirSync(path.dirname(action.destination), { recursive: true });
    fs.copyFileSync(action.source, action.destination);
    written.push(action.to);
  }
  const imported = [];
  if (plan.cssImports.length > 0) {
    const globalCss = path.join(projectRoot, 'src', 'styles', 'global.css');
    fs.mkdirSync(path.dirname(globalCss), { recursive: true });
    let css = fs.existsSync(globalCss) ? fs.readFileSync(globalCss, 'utf8') : '';
    for (const target of plan.cssImports) {
      if (css.includes(`'${target}'`) || css.includes(`"${target}"`)) continue;
      css = insertImport(css, target);
      imported.push(target);
    }
    if (imported.length > 0) fs.writeFileSync(globalCss, css, 'utf8');
  }
  return { written, imported };
}

/** Group per-file actions as "dir/ (n): a b c" so a five-template plan is a screenful, not a file dump. */
function groupByFolder(actions) {
  const groups = new Map();
  for (const action of actions) {
    const folder = path.posix.dirname(action.to);
    const key = `${action.template}|${folder}`;
    if (!groups.has(key)) groups.set(key, { folder, names: [] });
    groups.get(key).names.push(path.posix.basename(action.to));
  }
  return [...groups.values()];
}

export function renderPlan(plan, { apply, result, verbose = false } = {}) {
  const lines = [`site-templates ${apply ? 'apply' : 'dry-run'}: ${plan.order.join(' -> ')}`];
  const counts = { new: 0, same: 0, differs: 0, kept: 0 };
  for (const action of plan.actions) counts[action.status] += 1;
  const fresh = plan.actions.filter((entry) => entry.status === 'new');
  const verb = apply ? 'wrote ' : 'add   ';
  if (verbose) for (const action of fresh) lines.push(`${verb} ${action.to}`);
  else {
    // One line per template: folders with file counts. `show <name>` or --verbose names the files.
    for (const name of plan.order) {
      const groups = groupByFolder(fresh.filter((entry) => entry.template === name));
      if (groups.length > 0) lines.push(`${verb} ${name}: ${groups.map((group) => `${group.folder}/ x${group.names.length}`).join(', ')}`);
    }
  }
  for (const action of plan.actions.filter((entry) => entry.status === 'differs')) lines.push(`DIFFERS ${action.to}  (exists with other content; --force to overwrite)`);
  lines.push(`files: ${counts.new} ${apply ? 'written' : 'to add'}, ${counts.same} identical, ${counts.kept} kept (existing data), ${counts.differs} differ`);
  if (plan.cssImports.length > 0) lines.push(`global.css imports: ${(result?.imported ?? plan.cssImports).join(', ') || '(already present)'}`);
  for (const item of plan.manual) lines.push(`manual prerequisite: ${item}`);
  if (plan.env.length > 0) lines.push(`env: ${plan.env.join(', ')}`);
  const seen = new Set();
  for (const item of plan.next) {
    if (seen.has(item.text)) continue; // two templates can share a follow-up (form-doctor); print it once
    seen.add(item.text);
    lines.push(`next [${item.template}]: ${item.text}`);
  }
  if (!apply) lines.push('Re-run with --apply to copy.');
  return `${lines.join('\n')}\n`;
}

/** README outline: heading + line count per section, so a model reads only the section it needs. */
export function readmeSections(manifest) {
  const file = path.join(manifest.directory, 'README.md');
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const sections = [];
  let fence = false;
  lines.forEach((line, index) => {
    if (line.startsWith('```')) fence = !fence;
    if (!fence && /^#{1,3} /.test(line)) sections.push({ title: line.replace(/^#+\s*/, ''), start: index, end: lines.length });
  });
  sections.forEach((section, index) => { if (sections[index + 1]) section.end = sections[index + 1].start; });
  return sections.map((section) => ({ ...section, text: lines.slice(section.start, section.end).join('\n').trimEnd() }));
}

/** Compact contract for one template; `section` prints one README section instead of the whole file. */
export function renderShow(manifest, { section, projectRoot = process.cwd(), manifests = loadManifests() } = {}) {
  const sections = readmeSections(manifest);
  if (section) {
    const wanted = String(section).toLowerCase();
    const hit = sections.find((entry) => entry.title.toLowerCase().includes(wanted));
    if (!hit) throw new Error(`No section matching "${section}" in ${manifest.name}. Sections: ${sections.map((entry) => entry.title).join(' | ')}`);
    return `${hit.text}\n`;
  }
  const plan = planInstall(projectRoot, [manifest.name], { manifests });
  const own = plan.actions.filter((action) => action.template === manifest.name);
  const lines = [`${manifest.name}: ${manifest.description}`];
  if (manifest.requires?.length) lines.push(`needs: ${manifest.requires.join(', ')} (installed first automatically)`);
  for (const group of groupByFolder(own)) lines.push(`installs ${group.folder}/ (${group.names.length}): ${group.names.join(' ')}`);
  if (manifest.cssImports?.length) lines.push(`global.css imports: ${manifest.cssImports.join(', ')}`);
  if (manifest.env?.length) lines.push(`env: ${manifest.env.join(', ')}`);
  for (const text of manifest.next ?? []) lines.push(`next: ${text}`);
  if (sections.length > 0) lines.push(`README sections (site-templates show ${manifest.name} --section <words>): ${sections.map((entry) => `${entry.title} [${entry.end - entry.start}l]`).join(' | ')}`);
  return `${lines.join('\n')}\n`;
}
