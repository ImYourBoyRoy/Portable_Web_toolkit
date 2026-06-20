#!/usr/bin/env node
// ./scripts/site-tool.mjs
/**
 * Neutral site-profile wrapper for root npm scripts.
 *
 * Resolves --site-profile, PORTABLE_DEFAULT_PROFILE, or exits with guidance.
 *
 * Run:
 *   node ./scripts/site-tool.mjs cache-purge [--apply]
 *   node ./scripts/site-tool.mjs perf [--strategy mobile|desktop]
 *   node ./scripts/site-tool.mjs optimize-loop [--environment production] [--skip-build] [--apply]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const toolkitRoot = path.join(projectRoot, 'Web_Toolkit');

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

function resolveProfilePath(flags) {
  const explicit = String(flags['site-profile'] || process.env.PORTABLE_DEFAULT_PROFILE || '').trim();
  if (!explicit) {
    throw new Error(
      'Missing site profile. Pass --site-profile <path> or set PORTABLE_DEFAULT_PROFILE before running site-scoped npm scripts.'
    );
  }

  const candidates = [
    path.resolve(projectRoot, explicit),
    path.resolve(toolkitRoot, explicit),
    path.resolve(toolkitRoot, 'site-profiles', explicit),
    path.resolve(projectRoot, 'Private_Site_Profiles', explicit)
  ];
  const resolved = candidates.find((entry) => fs.existsSync(entry));
  if (!resolved) {
    throw new Error(`Site profile not found: ${explicit}`);
  }
  return resolved;
}

function runNode(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  process.exit(typeof result.status === 'number' ? result.status : 1);
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const primary = String(command[0] || '').toLowerCase();
  const profilePath = resolveProfilePath(flags);
  const profileFlag = ['--site-profile', profilePath];

  if (primary === 'cache-purge') {
    const args = [
      path.join(toolkitRoot, 'cache_purge', 'bin', 'cache-purge.mjs'),
      ...profileFlag,
      '--project-root',
      projectRoot
    ];
    if (flags.apply) args.push('--apply');
    return runNode(args[0], args.slice(1));
  }

  if (primary === 'perf') {
    const args = [
      path.join(toolkitRoot, 'pagespeed_diagnostics', 'bin', 'pagespeed-diagnostics.mjs'),
      'run',
      ...profileFlag,
      '--project-root',
      projectRoot
    ];
    if (flags.strategy) args.push('--strategy', String(flags.strategy));
    return runNode(args[0], args.slice(1));
  }

  if (primary === 'optimize-loop') {
    const batPath = path.join(toolkitRoot, 'Optimize_Loop.bat');
    const batArgs = ['--site-profile', profilePath];
    if (flags.environment) batArgs.push('--environment', String(flags.environment));
    if (flags['skip-build']) batArgs.push('--skip-build');
    if (flags.apply) batArgs.push('--apply');
    const result = spawnSync('cmd.exe', ['/d', '/s', '/c', batPath, ...batArgs], {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    process.exit(typeof result.status === 'number' ? result.status : 1);
  }

  throw new Error(`Unknown site-tool command: ${primary || '(none)'}. Expected cache-purge, perf, or optimize-loop.`);
}

try {
  main();
} catch (error) {
  console.error('\n[site-tool] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
