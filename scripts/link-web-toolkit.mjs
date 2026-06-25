#!/usr/bin/env node
// ./scripts/link-web-toolkit.mjs
/**
 * Link Web_Toolkit into a client project (junction on Windows, symlink elsewhere).
 *
 * Usage:
 *   node ./scripts/link-web-toolkit.mjs --toolkit-path <Web_Toolkit-abs> --project-root <site-abs>
 *   node ./scripts/link-web-toolkit.mjs --toolkit-path <path> --project-root <path> --name web_toolkit
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readFlag(argv, name, fallback = '') {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

function resolveExistingTarget(linkPath) {
  try {
    return fs.realpathSync(linkPath);
  } catch {
    return '';
  }
}

function linkToolkit({ projectRoot, toolkitPath, linkName = 'Web_Toolkit' }) {
  const resolvedProject = path.resolve(projectRoot);
  const resolvedToolkit = path.resolve(toolkitPath);
  const linkPath = path.join(resolvedProject, linkName);
  const marker = path.join(resolvedToolkit, 'site_readiness', 'bin', 'site-readiness.mjs');

  if (!fs.existsSync(resolvedToolkit)) {
    throw new Error(`Toolkit path not found: ${resolvedToolkit}`);
  }
  if (!fs.existsSync(marker)) {
    throw new Error(`Path does not look like Web_Toolkit (missing site-readiness): ${resolvedToolkit}`);
  }
  if (!fs.existsSync(resolvedProject)) {
    fs.mkdirSync(resolvedProject, { recursive: true });
  }

  if (fs.existsSync(linkPath)) {
    const existing = resolveExistingTarget(linkPath);
    if (existing && path.resolve(existing) === resolvedToolkit) {
      return { linkPath, target: resolvedToolkit, created: false, message: 'already linked' };
    }
    throw new Error(`Link path already exists: ${linkPath}`);
  }

  if (process.platform === 'win32') {
    fs.symlinkSync(resolvedToolkit, linkPath, 'junction');
  } else {
    fs.symlinkSync(resolvedToolkit, linkPath, 'dir');
  }

  return { linkPath, target: resolvedToolkit, created: true, message: 'linked' };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('link-web-toolkit — junction/symlink Web_Toolkit into a client project');
    console.log('');
    console.log('Usage:');
    console.log('  node ./scripts/link-web-toolkit.mjs --toolkit-path <abs> --project-root <abs> [--name Web_Toolkit]');
    process.exit(0);
  }

  const projectRoot = readFlag(argv, '--project-root', process.cwd());
  const toolkitPath = readFlag(argv, '--toolkit-path', '');
  const linkName = readFlag(argv, '--name', 'Web_Toolkit');

  if (!toolkitPath) {
    console.error('[link-web-toolkit] --toolkit-path is required');
    process.exit(1);
  }

  try {
    const result = linkToolkit({ projectRoot, toolkitPath, linkName });
    console.log(`[link-web-toolkit] ${result.message}: ${result.linkPath} -> ${result.target}`);
  } catch (error) {
    console.error('[link-web-toolkit]', error.message ?? error);
    process.exit(1);
  }
}

main();
