#!/usr/bin/env node
// ./Web_Toolkit/toolkit_index/bin/toolkit-index.mjs
/**
 * CLI entrypoint for toolkit-index: the toolkit map for AI models (generated docs/TOOLS.md, find, check).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs } from '../../shared/lib/cli.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { collectTools, findTools, renderMatch, renderToolsMd } from '../src/index.mjs';

const WEB_TOOLKIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOLS_MD = path.resolve(WEB_TOOLKIT, '..', 'docs', 'TOOLS.md');

function printHelp() {
  return printStandardHelp({
    name: 'toolkit-index',
    summary: 'The toolkit map for AI models: find the right tool for a task, and keep docs/TOOLS.md generated from the tools\' own help.',
    usage: ['toolkit-index find "<task>" [--limit 3]', 'toolkit-index build', 'toolkit-index check'],
    commands: [
      { name: 'find', description: 'Rank tools for a free-text task and print usage and an example for each (token-lean).' },
      { name: 'build', description: 'Regenerate docs/TOOLS.md from every tool\'s structured help (writes one file).' },
      { name: 'check', description: 'Exit 2 when docs/TOOLS.md is stale (a tool or intent changed without a rebuild).' }
    ],
    flags: [{ name: '--limit <n>', description: 'find: number of matches (default 3).' }],
    examples: ['toolkit-index find "compare five themes on this site"', 'toolkit-index build', 'toolkit-index check'],
    notes: ['build writes docs/TOOLS.md only. find and check are read-only.', 'The index is generated from each CLI\'s --help (PORTABLE_TOOLKIT_HELP_JSON=1), so it cannot drift from the tools.'],
    exitCodes: [{ name: '0', description: 'Completed (check: index is current).' }, { name: '2', description: 'check: index is stale.' }, { name: '1', description: 'Unhandled failure.' }]
  });
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const primary = String(command[0] || 'help').toLowerCase();
  if (['help', '--help', '-h'].includes(primary) || flags.help) { printHelp(); return 0; }
  const tools = collectTools(WEB_TOOLKIT);
  if (primary === 'find') {
    const query = command.slice(1).join(' ');
    if (!query) throw new Error('find needs a task, for example: toolkit-index find "convert npm to pnpm"');
    const matches = findTools(query, tools, Number(flags.limit || 3));
    if (matches.length === 0) { console.log('No match. Read docs/TOOLS.md or run `toolkit-index build` if a tool is missing.'); return 0; }
    console.log(matches.map((tool) => renderMatch(tool, query)).join('\n\n'));
    return 0;
  }
  const rendered = renderToolsMd(tools);
  if (primary === 'build') {
    fs.mkdirSync(path.dirname(TOOLS_MD), { recursive: true });
    fs.writeFileSync(TOOLS_MD, rendered, 'utf8');
    console.log(`wrote ${path.relative(process.cwd(), TOOLS_MD) || TOOLS_MD}: ${tools.length} tools, ~${Math.round(rendered.length / 4)} tokens`);
    return 0;
  }
  if (primary === 'check') {
    const current = fs.existsSync(TOOLS_MD) ? fs.readFileSync(TOOLS_MD, 'utf8') : '';
    if (current === rendered) { console.log('docs/TOOLS.md is current'); return 0; }
    console.error('docs/TOOLS.md is stale: run `node Web_Toolkit/toolkit_index/bin/toolkit-index.mjs build`');
    return 2;
  }
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => { console.error('[toolkit-index]', error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
