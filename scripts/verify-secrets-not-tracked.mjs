#!/usr/bin/env node
// ./scripts/verify-secrets-not-tracked.mjs
/**
 * Pre-push guard: ensure secret files are gitignored and not staged/tracked.
 *
 * Run before git push:
 *   node ./scripts/verify-secrets-not-tracked.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const SECRET_PATHS = [
  '.env',
  'Web_Toolkit/.env',
  '.dev.vars',
  'Private_Site_Profiles',
];

const SECRET_GLOBS_IN_INDEX = [
  /^\.env$/i,
  /^\.env\./i,
  /^Web_Toolkit\/\.env$/i,
  /^Private_Site_Profiles\//i,
  /\/\.env$/i,
  /smoke-manifest\.json$/i,
  /^MEMORY\.md$/i,
  /^Web_Toolkit\/MEMORY\.md$/i,
  /^RED_TEAM_REPORT\.md$/i,
  /^Web_Toolkit\/RED_TEAM_REPORT\.md$/i,
];

function git(args) {
  return spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

function trackedFiles() {
  const result = git(['ls-files']);
  if (result.status !== 0) {
    throw new Error(result.stderr || 'git ls-files failed');
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function stagedFiles() {
  const result = git(['diff', '--cached', '--name-only']);
  if (result.status !== 0) {
    throw new Error(result.stderr || 'git diff --cached failed');
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function isSecretPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  if (/^\.env\.example$/i.test(normalized)) return false;
  if (/^Web_Toolkit\/\.env\.example$/i.test(normalized)) return false;
  if (/\.env\..*\.example$/i.test(normalized)) return false;
  return SECRET_GLOBS_IN_INDEX.some((pattern) => pattern.test(normalized));
}

function checkIgnored(relativePath) {
  const result = git(['check-ignore', '-q', relativePath]);
  return result.status === 0;
}

function main() {
  const failures = [];
  const tracked = trackedFiles();
  const staged = stagedFiles();

  for (const file of [...tracked, ...staged]) {
    if (isSecretPath(file)) {
      failures.push(`Secret or operator-local file is tracked/staged: ${file}`);
    }
  }

  for (const secretPath of SECRET_PATHS) {
    const full = path.join(repoRoot, secretPath);
    if (fs.existsSync(full) && !checkIgnored(secretPath)) {
      failures.push(`Exists but NOT gitignored: ${secretPath}`);
    }
  }

  if (failures.length > 0) {
    console.error('\n[verify-secrets-not-tracked] BLOCKED');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error('\nRemove from index: git rm --cached <path>');
    console.error('Ensure paths are listed in .gitignore before pushing.');
    process.exit(1);
  }

  console.log('\n[verify-secrets-not-tracked] OK');
  console.log('- No .env, private profiles, or operator MEMORY/RED_TEAM files in git index');
  console.log('- Local secret paths are gitignored');
}

try {
  main();
} catch (error) {
  console.error('\n[verify-secrets-not-tracked] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
