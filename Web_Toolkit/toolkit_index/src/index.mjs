// ./Web_Toolkit/toolkit_index/src/index.mjs
/**
 * The map of the toolkit for an AI model: one line per tool, grouped by what you are trying to do, plus a
 * task -> tool table and the template list. Generated from each CLI's own structured help (so it cannot drift from
 * the tools) and checked for staleness by `toolkit-index check`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INTENTS = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'intents.json'), 'utf8'));

export function collectTools(webToolkitRoot = ROOT) {
  const pkg = JSON.parse(fs.readFileSync(path.join(webToolkitRoot, 'package.json'), 'utf8'));
  const tools = [];
  for (const [name, bin] of Object.entries(pkg.bin ?? {})) {
    const file = path.join(webToolkitRoot, bin);
    const result = spawnSync(process.execPath, [file, '--help'], { encoding: 'utf8', env: { ...process.env, PORTABLE_TOOLKIT_HELP_JSON: '1', PORTABLE_TOOLKIT_AUTO_UPDATE: '0' }, timeout: 30_000 });
    let help = null;
    try { help = JSON.parse(String(result.stdout).trim().split('\n').pop()); } catch { /* legacy text help */ }
    const text = String(result.stdout).trim();
    tools.push({
      name,
      bin,
      summary: help?.summary ?? text.split('\n')[0]?.replace(/^\S+\s+[—-]\s+/, '') ?? '',
      usage: help?.usage ?? [],
      commands: (help?.commands ?? []).map((command) => (typeof command === 'string' ? { name: command, description: '' } : { name: command.name, description: command.description ?? '' })),
      examples: help?.examples ?? [],
      sideEffects: (help?.notes ?? []).filter((note) => /dry-run|--apply|writes|mutat|deploys?|delete/i.test(note)).slice(0, 1)
    });
  }
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text);

export function renderToolsMd(tools) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const lines = [
    '# Toolkit map (generated: `node Web_Toolkit/toolkit_index/bin/toolkit-index.mjs build`)',
    '',
    'Find a tool: `toolkit-index find "<what you want to do>"`. Any tool: `<tool> --help` (Usage, Flags, Examples, Exit codes).',
    'Rules that apply everywhere: read the site profile first; mutations are dry-run until `--apply`; run `site-readiness` before material work.',
    '',
    '## I want to...',
    ''
  ];
  for (const intent of INTENTS.intents) lines.push(`- ${intent.task} -> **${intent.use}**${intent.then ? ` (${intent.then})` : ''}`);
  lines.push('');
  const placed = new Set();
  for (const [category, names] of Object.entries(INTENTS.categories)) {
    lines.push(`## ${category}`, '');
    for (const name of names) {
      const tool = byName.get(name);
      if (!tool) continue;
      placed.add(name);
      const commands = tool.commands.map((command) => command.name.split(/\s+/)[0]).filter((command) => !command.startsWith('-')).slice(0, 6);
      const subs = commands.length > 1 ? ` [${[...new Set(commands)].join(', ')}]` : '';
      lines.push(`- **${tool.name}**${subs}: ${clip(tool.summary, 150)}`);
      if (tool.examples[0]) lines.push(`  \`${clip(tool.examples[0], 140)}\``);
    }
    lines.push('');
  }
  const rest = tools.filter((tool) => !placed.has(tool.name));
  if (rest.length > 0) {
    lines.push('## Other', '');
    for (const tool of rest) lines.push(`- **${tool.name}**: ${clip(tool.summary, 150)}`);
    lines.push('');
  }
  lines.push('## Templates (copy-ready, theme-token based; see each README)', '');
  for (const [dir, what] of INTENTS.templates) lines.push(`- \`Web_Toolkit/${dir}\`: ${what}`);
  lines.push('');
  return `${lines.join('\n')}`;
}

/** Ranked match of a free-text task against intents, tool summaries, commands, and examples. */
export function findTools(query, tools, limit = 3) {
  const words = String(query).toLowerCase().split(/[^a-z0-9-]+/).filter((word) => word.length > 2);
  if (words.length === 0) return [];
  const scored = new Map();
  const bump = (name, amount) => scored.set(name, (scored.get(name) ?? 0) + amount);
  for (const intent of INTENTS.intents) {
    const haystack = `${intent.task} ${intent.use} ${intent.then ?? ''}`.toLowerCase();
    for (const word of words) if (haystack.includes(word)) bump(intent.use, 3);
  }
  for (const tool of tools) {
    const haystack = `${tool.name} ${tool.summary} ${tool.commands.map((c) => `${c.name} ${c.description}`).join(' ')}`.toLowerCase();
    for (const word of words) if (haystack.includes(word)) bump(tool.name, 1);
  }
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name]) => byName.get(name)).filter(Boolean);
}

export function renderMatch(tool, query = '') {
  const words = String(query).toLowerCase().split(/[^a-z0-9-]+/).filter((word) => word.length > 2);
  const score = (text) => words.filter((word) => text.toLowerCase().includes(word)).length;
  const lines = [`${tool.name}: ${tool.summary}`];
  const usages = [...tool.usage].sort((a, b) => score(b) - score(a));
  for (const usage of usages.slice(0, 3)) lines.push(`  ${clip(usage, 170)}`);
  const example = [...tool.examples].sort((a, b) => score(b) - score(a))[0];
  if (example) lines.push(`  e.g. ${clip(example, 170)}`);
  lines.push(`  full help: ${tool.name} --help`);
  return lines.join('\n');
}
