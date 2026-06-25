#!/usr/bin/env node
// ./scripts/check-toolkit-update.mjs
/**
 * Compare installed/local toolkit version against GitHub latest tag.
 * Run at session start so agents use current skills and CLIs.
 *
 * Usage:
 *   node ./scripts/check-toolkit-update.mjs
 *   node ./scripts/check-toolkit-update.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_REPO = 'imyourboyroy/Portable_Web_toolkit';
const STAMP_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.portable-web-toolkit',
  'install-stamp.json',
);

function readVersionFile(root) {
  const versionPath = path.join(root, 'VERSION');
  if (!fs.existsSync(versionPath)) return '';
  return fs.readFileSync(versionPath, 'utf8').trim();
}

function readStamp() {
  if (!STAMP_PATH || !fs.existsSync(STAMP_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(STAMP_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function localGitHead(root) {
  const result = spawnSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

async function fetchLatestTag(repo = DEFAULT_REPO) {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'portable-web-toolkit' },
  });
  if (response.status === 404) {
    const tags = await fetch(`https://api.github.com/repos/${repo}/tags?per_page=1`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'portable-web-toolkit' },
    });
    if (!tags.ok) throw new Error(`GitHub API HTTP ${tags.status}`);
    const list = await tags.json();
    return list[0]?.name?.replace(/^v/, '') || '';
  }
  if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
  const payload = await response.json();
  return String(payload.tag_name || '').replace(/^v/, '');
}

async function main() {
  const jsonOut = process.argv.includes('--json');
  const localVersion = readVersionFile(repoRoot);
  const stamp = readStamp();
  const head = localGitHead(repoRoot);

  let remoteVersion = '';
  let networkError = '';

  try {
    remoteVersion = await fetchLatestTag();
  } catch (error) {
    networkError = error instanceof Error ? error.message : String(error);
  }

  const installedVersion = stamp?.version || '';
  const updateAvailable = Boolean(
    remoteVersion && localVersion && remoteVersion !== localVersion,
  );

  const report = {
    localVersion,
    remoteVersion: remoteVersion || null,
    installedVersion: installedVersion || null,
    installedAt: stamp?.installedAt || null,
    localCommit: head || stamp?.commit || null,
    updateAvailable,
    networkError: networkError || null,
    updateCommand: process.platform === 'win32'
      ? './scripts/update-toolkit.ps1'
      : './scripts/update-toolkit.sh',
    installSkills: './scripts/install-agent-skills.ps1 -Agent all',
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('[toolkit-version] Portable Web Toolkit');
    console.log(`  Local VERSION: ${localVersion || '(missing)'}`);
    if (installedVersion) console.log(`  Last skill install: v${installedVersion} @ ${stamp?.installedAt || 'unknown'}`);
    if (head) console.log(`  Local commit: ${head}`);
    if (remoteVersion) console.log(`  GitHub latest: v${remoteVersion}`);
    if (networkError) console.log(`  Network: ${networkError} (skipped remote check)`);
    if (updateAvailable) {
      console.log('');
      console.log('  UPDATE AVAILABLE — run:');
      console.log(`    ${report.updateCommand}`);
    } else if (remoteVersion) {
      console.log('  Status: up to date with GitHub latest tag');
    }
  }

  process.exitCode = updateAvailable ? 2 : 0;
}

main().catch((error) => {
  console.error('[toolkit-version]', error.message ?? error);
  process.exitCode = 1;
});
