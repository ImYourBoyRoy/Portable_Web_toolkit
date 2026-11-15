#!/usr/bin/env node
// ./Web_Toolkit/toolkit_purge/bin/toolkit-purge.mjs
/**
 * Cleans deletable runtime artifacts from the portable toolkit workspace.
 *
 * Run `node ./bin/toolkit-purge.mjs [--apply]` to preview or remove generated
 * exports, runtime reports, caches, session files, and Python bytecode.
 */

import { parseCliArgs as sharedParseCliArgs } from '../../shared/lib/cli.mjs';
import path from 'node:path';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { resolvePortableRoot } from '../../shared/lib/context.mjs';
import { bytesFor, collectTargets, removeTarget } from '../src/lib/targets.mjs';

const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 2);

function parseArgs(argv = []) {
  const { command, flags } = sharedParseCliArgs(argv);
  return { command, flags };
}

function printHelp() {
  return printStandardHelp({
    name: 'toolkit-purge',
    summary: 'Clean deletable portable-toolkit runtime artifacts',
    usage: [
      'toolkit-purge [--apply]'
    ],
    commands: [
      { name: 'default', description: 'Preview or remove generated runtime folders, exports, sessions, bytecode, and legacy report artifacts.' }
    ],
    flags: [
      { name: '--apply', description: 'Actually delete the detected runtime artifacts. Dry-run is the default.' }
    ],
    examples: [
      'toolkit-purge',
      'toolkit-purge --apply'
    ],
    notes: [
      'This command preserves source code, docs, shared examples, and site profiles.',
      'Symlinks are never followed or deleted through, and node_modules/.git are never scanned.',
      'Use it before zipping or sharing the portable toolkit.'
    ],
    exitCodes: [
      { name: '0', description: 'Dry-run or cleanup completed successfully.' },
      { name: '1', description: 'Unhandled failure.' }
    ]
  });
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const primary = String(command[0] || '').toLowerCase();
  if (['help', '--help', '-h'].includes(primary) || flags.help) {
    printHelp();
    return 0;
  }

  const targets = collectTargets(PORTABLE_ROOT);
  const totalBytes = targets.reduce((sum, targetPath) => sum + bytesFor(targetPath), 0);
  const apply = ['1', 'true', 'yes', 'on'].includes(String(flags.apply || 'false').toLowerCase());

  console.log('\nPortable toolkit purge');
  console.log(`- Root: ${PORTABLE_ROOT}`);
  console.log(`- Targets: ${targets.length}`);
  console.log(`- Estimated reclaim: ${formatBytes(totalBytes)}`);
  for (const targetPath of targets) {
    console.log(`  - ${path.relative(PORTABLE_ROOT, targetPath).replace(/\\/g, '/') || '.'}`);
  }

  if (!apply) {
    console.log('- Mode: dry-run');
    return 0;
  }

  for (const targetPath of targets) {
    removeTarget(PORTABLE_ROOT, targetPath);
  }
  console.log('- Mode: applied');
  return 0;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error('\n[toolkit-purge] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

