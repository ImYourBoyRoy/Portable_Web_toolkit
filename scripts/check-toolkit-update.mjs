#!/usr/bin/env node
// ./scripts/check-toolkit-update.mjs
/**
 * Compare installed/local toolkit version against the public release, tag, or
 * default-branch VERSION. This command is read-only.
 *
 * Usage:
 *   node ./scripts/check-toolkit-update.mjs
 *   node ./scripts/check-toolkit-update.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { compareSemver } from './version-lib.mjs';

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

function gitOutput(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function localGitState(root) {
  const head = gitOutput(root, ['rev-parse', '--short', 'HEAD']);
  if (!head) {
    return { head: '', dirty: false, aheadOfOriginMain: null, behindOriginMain: null };
  }
  const dirty = Boolean(gitOutput(root, ['status', '--porcelain']));
  const relation = gitOutput(
    root,
    ['rev-list', '--left-right', '--count', 'refs/remotes/origin/main...HEAD'],
  );
  const counts = relation ? relation.split(/\s+/).map(Number) : [];
  return {
    head,
    dirty,
    behindOriginMain: Number.isFinite(counts[0]) ? counts[0] : null,
    aheadOfOriginMain: Number.isFinite(counts[1]) ? counts[1] : null,
  };
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
    if (list[0]?.name) return list[0].name.replace(/^v/, '');
    const raw = await fetch(`https://raw.githubusercontent.com/${repo}/main/VERSION`, {
      headers: { 'User-Agent': 'portable-web-toolkit' },
    });
    if (!raw.ok) throw new Error(`GitHub raw VERSION HTTP ${raw.status}`);
    return (await raw.text()).trim();
  }
  if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
  const payload = await response.json();
  return String(payload.tag_name || '').replace(/^v/, '');
}

async function main() {
  const jsonOut = process.argv.includes('--json');
  const localVersion = readVersionFile(repoRoot);
  const stamp = readStamp();
  const gitState = localGitState(repoRoot);

  let remoteVersion = '';
  let networkError = '';

  try {
    remoteVersion = await fetchLatestTag();
  } catch (error) {
    networkError = error instanceof Error ? error.message : String(error);
  }

  const installedVersion = stamp?.version || '';
  const versionComparison = remoteVersion && localVersion
    ? compareSemver(localVersion, remoteVersion)
    : null;
  const versionMismatch = Boolean(
    remoteVersion && localVersion && remoteVersion !== localVersion,
  );
  const remoteVersionIsNewer = versionComparison === -1;
  const localVersionIsNewer = versionComparison === 1;
  const updateAvailable = Boolean(
    remoteVersionIsNewer
    || (gitState.behindOriginMain && gitState.behindOriginMain > 0),
  );

  const report = {
    localVersion,
    remoteVersion: remoteVersion || null,
    installedVersion: installedVersion || null,
    installedAt: stamp?.installedAt || null,
    localCommit: gitState.head || stamp?.commit || null,
    localDirty: gitState.dirty,
    aheadOfOriginMain: gitState.aheadOfOriginMain,
    behindOriginMain: gitState.behindOriginMain,
    versionComparison,
    versionMismatch,
    remoteVersionIsNewer,
    localVersionIsNewer,
    updateAvailable,
    networkError: networkError || null,
    updateCommand: process.platform === 'win32'
      ? './scripts/update-toolkit.ps1'
      : './scripts/update-toolkit.sh',
    skillStatus: './scripts/check-agent-skills.mjs --agent <client>',
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('[toolkit-version] Portable Web Toolkit');
    console.log(`  Local VERSION: ${localVersion || '(missing)'}`);
    if (installedVersion) console.log(`  Last skill install: v${installedVersion} @ ${stamp?.installedAt || 'unknown'}`);
    if (gitState.head) console.log(`  Local commit: ${gitState.head}`);
    if (gitState.dirty) console.log('  Worktree: modified');
    if (gitState.aheadOfOriginMain) {
      console.log(`  Local branch: ${gitState.aheadOfOriginMain} commit(s) ahead of origin/main`);
    }
    if (gitState.behindOriginMain) {
      console.log(`  Local branch: ${gitState.behindOriginMain} commit(s) behind origin/main`);
    }
    if (remoteVersion) console.log(`  GitHub latest: v${remoteVersion}`);
    if (networkError) console.log(`  Network: ${networkError} (skipped remote check)`);
    if (updateAvailable) {
      console.log('');
      console.log('  UPDATE AVAILABLE — run:');
      console.log(`    ${report.updateCommand}`);
    } else if (localVersionIsNewer) {
      console.log('  Status: local version is newer than the selected public version source');
    } else if (versionMismatch && versionComparison === null) {
      console.log('  Status: versions differ and require manual comparison');
    } else if (
      remoteVersion
      && (gitState.dirty || (gitState.aheadOfOriginMain && gitState.aheadOfOriginMain > 0))
    ) {
      console.log('  Status: public version baseline is current; local unreleased changes are present');
    } else if (remoteVersion) {
      console.log('  Status: up to date with the selected public version source');
    }
  }

  process.exitCode = updateAvailable ? 2 : 0;
}

main().catch((error) => {
  console.error('[toolkit-version]', error.message ?? error);
  process.exitCode = 1;
});
