// ./Web_Toolkit/cloudflare-agent-toolkit/scripts/export-toolkit.mjs
/**
 * Portable export utility for the Cloudflare Agent Toolkit.
 *
 * Run `node ./scripts/export-toolkit.mjs [--to <dir>] [--zip]` to create a
 * clean, shareable copy excluding secrets/runtime artifacts. Inputs: optional
 * CLI flags. Outputs: exported folder under the portable runtime area by
 * default, optional zip, and console summary.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveRuntimePath } from '../../shared/lib/context.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const toolkitRoot = path.resolve(__dirname, '..');
const portableRoot = path.resolve(toolkitRoot, '..');

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function shouldIgnore(name) {
  return ['node_modules', '.git', '.env', '.runtime', 'output', '.cf-agent', 'dist', '__pycache__'].includes(name) || name.endsWith('.pyc') || name.endsWith('.zip');
}

function copyRecursive(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      if (shouldIgnore(entry)) continue;
      copyRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  // Preserve executable bits so .sh / .command launchers stay runnable after export.
  fs.chmodSync(target, stat.mode);
}

function exportToolkit(flags) {
  const toFlag = flags.to ? path.resolve(String(flags.to)) : resolveRuntimePath(portableRoot, 'exports', 'cloudflare-agent-toolkit');
  if (fs.existsSync(toFlag)) {
    fs.rmSync(toFlag, { recursive: true, force: true });
  }
  copyRecursive(toolkitRoot, toFlag);

  const metadata = {
    createdAt: new Date().toISOString(),
    exportName: path.basename(toFlag),
    sanitized: true
  };
  fs.writeFileSync(path.join(toFlag, 'EXPORT-METADATA.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  let zipPath = null;
  if (flags.zip) {
    const distRoot = path.dirname(toFlag);
    const baseName = path.basename(toFlag);
    zipPath = path.join(distRoot, `${baseName}.zip`);
    if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
    const command = `Compress-Archive -Path "${toFlag}\\*" -DestinationPath "${zipPath}" -Force`;
    const zipped = spawnSync('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
    if (zipped.status !== 0) {
      zipPath = null;
      console.warn('[export] zip step skipped (Compress-Archive failed on this environment).');
    }
  }

  console.log('\n[export] toolkit export complete');
  console.log(`- export: ${toFlag}`);
  if (zipPath) console.log(`- zip: ${zipPath}`);
}

exportToolkit(parseArgs(process.argv.slice(2)));

