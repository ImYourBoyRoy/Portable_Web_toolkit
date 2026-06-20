#!/usr/bin/env node
// ./Web_Toolkit/toolkit_purge/bin/toolkit-purge.mjs
/**
 * Cleans deletable runtime artifacts from the portable toolkit workspace.
 *
 * Run `node ./bin/toolkit-purge.mjs [--apply]` to preview or remove generated
 * exports, runtime reports, caches, session files, and Python bytecode.
 */

import fs from 'node:fs';
import path from 'node:path';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { resolvePortableRoot, resolveRuntimePath } from '../../shared/lib/context.mjs';

const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 2);

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
      'Use it before zipping or sharing the portable toolkit.'
    ],
    exitCodes: [
      { name: '0', description: 'Dry-run or cleanup completed successfully.' },
      { name: '1', description: 'Unhandled failure.' }
    ]
  });
}

function walk(root, predicate) {
  const matches = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!fs.existsSync(current)) continue;
    const stat = fs.statSync(current);
    if (predicate(current, stat)) {
      matches.push(current);
      if (stat.isDirectory()) continue;
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        queue.push(path.join(current, entry));
      }
    }
  }
  return matches;
}

function bytesFor(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return stat.size;
  return walk(targetPath, (_current, currentStat) => currentStat.isFile()).reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function isGeneratedDirectory(current, stat, portableRoot) {
  if (!stat.isDirectory()) return false;
  const name = path.basename(current);
  const relative = path.relative(portableRoot, current).replace(/\\/g, '/');

  if (['.runtime', '.cf-agent', '__pycache__', '.pytest_cache'].includes(name)) return true;
  if ((name === 'output' || name === 'dist') && (relative === name || relative.endsWith(`/${name}`))) {
    const parent = path.dirname(current);
    if (path.resolve(parent) === path.resolve(portableRoot)) return true;
    const parentName = path.basename(parent);
    if (!parentName.startsWith('.') && !['node_modules', 'src', 'shared'].includes(parentName)) {
      return true;
    }
  }
  return false;
}

function isGeneratedFile(current, stat) {
  if (!stat.isFile()) return false;
  const name = path.basename(current);
  if (name === 'doctor.txt' || name === 'EXPORT-METADATA.json') return true;
  if (current.endsWith('.pyc') || current.endsWith('.zip')) return true;
  return false;
}

function cleanupTargets() {
  const dynamicTargets = walk(PORTABLE_ROOT, (current, stat) => isGeneratedDirectory(current, stat, PORTABLE_ROOT) || isGeneratedFile(current, stat));
  return [...new Set(dynamicTargets)].sort((left, right) => left.length - right.length);
}

function removeTarget(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return;
  }
  fs.rmSync(targetPath, { force: true });
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const primary = String(command[0] || '').toLowerCase();
  if (['help', '--help', '-h'].includes(primary) || flags.help) {
    printHelp();
    return 0;
  }

  const targets = cleanupTargets();
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
    if (!fs.existsSync(targetPath)) continue;
    removeTarget(targetPath);
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

