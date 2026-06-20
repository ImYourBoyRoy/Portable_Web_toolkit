#!/usr/bin/env node
// ./Web_Toolkit/junk_purge/bin/junk-purge.mjs
/**
 * Safe transient-file cleanup utility for Astro/Vite/Cloudflare project roots.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

const SAFE_DIRS = ['.astro', 'dist', '.wrangler', '.wrangler-state'];
const AGGRESSIVE_DIRS = ['.vite', '.cache'];

function parseArgs(argv) {
  const command = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      command.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function printHelp() {
  return printStandardHelp({
    name: 'junk-purge',
    summary: 'Safe transient-file cleanup utility for Astro/Vite/Cloudflare project roots',
    usage: [
      'junk-purge --project-root <path>',
      'junk-purge --project-root <path> --aggressive --apply'
    ],
    flags: [
      { name: '--project-root <path>', description: 'Target project root to scan for transient build/cache folders.' },
      { name: '--aggressive', description: 'Also remove additional cache directories such as .vite and .cache.' },
      { name: '--apply', description: 'Actually remove the targets. Without this flag the tool stays in dry-run mode.' }
    ],
    examples: [
      'junk-purge --project-root C:/sites/client-app',
      'junk-purge --project-root C:/sites/client-app --aggressive --apply'
    ],
    notes: [
      'Source files, env secrets, migrations, and documentation are intentionally not targeted.',
      'Dry-run is the default for safety.'
    ],
    exitCodes: [
      { name: '0', description: 'Dry-run or cleanup completed successfully.' },
      { name: '1', description: 'Unhandled failure.' }
    ]
  });
}

function findPycacheDirs(rootDir) {
  const matches = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__pycache__') {
          matches.push(fullPath);
          continue;
        }
        if (['node_modules', '.git'].includes(entry.name)) continue;
        stack.push(fullPath);
      }
    }
  }
  return matches;
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const primary = String(command[0] || '').toLowerCase();
  if (['help', '--help', '-h'].includes(primary) || flags.help) {
    printHelp();
    return 0;
  }
  const projectRoot = path.resolve(String(flags['project-root'] || process.cwd()));
  const dryRun = !['1', 'true', 'yes', 'on'].includes(String(flags.apply || 'false').toLowerCase());
  const aggressive = ['1', 'true', 'yes', 'on'].includes(String(flags.aggressive || 'false').toLowerCase());
  const targets = [...SAFE_DIRS, ...(aggressive ? AGGRESSIVE_DIRS : [])].map((entry) => path.join(projectRoot, entry));
  targets.push(...findPycacheDirs(projectRoot));

  console.log('\njunk-purge');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Dry run: ${dryRun ? 'yes' : 'no'}`);
  console.log(`- Aggressive: ${aggressive ? 'yes' : 'no'}`);

  let removed = 0;
  for (const target of [...new Set(targets)]) {
    if (!fs.existsSync(target)) continue;
    console.log(`- ${dryRun ? 'Would remove' : 'Removing'} ${target}`);
    if (!dryRun) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    removed += 1;
  }

  console.log(`- Targets affected: ${removed}`);
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  console.error('\n[junk-purge] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

