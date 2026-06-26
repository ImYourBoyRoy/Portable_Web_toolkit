#!/usr/bin/env node
// ./scripts/publish-github.mjs
/**
 * Safe publish flow: verify secrets, privacy scan, push, apply GitHub topics.
 *
 * Reads GH_TOKEN or GITHUB_TOKEN from root `.env` only (never committed).
 *
 * Run:
 *   node ./scripts/publish-github.mjs
 *   node ./scripts/publish-github.mjs --skip-push
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from '../Web_Toolkit/shared/lib/env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  return {
    skipPush: argv.includes('--skip-push'),
    dryRun: argv.includes('--dry-run'),
  };
}

function runNode(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(typeof result.status === 'number' ? result.status : 1);
  }
}

function loadGhTokenFromEnvFile() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return;
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) return;
  const values = loadEnvFile(envPath);
  const token = String(values.GH_TOKEN || values.GITHUB_TOKEN || '').trim();
  if (token) {
    process.env.GH_TOKEN = token;
  }
}

function gitPush(dryRun) {
  if (dryRun) {
    console.log('[dry-run] git push origin HEAD');
    return;
  }
  const result = spawnSync('git', ['push', 'origin', 'HEAD'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(typeof result.status === 'number' ? result.status : 1);
  }
}

function main() {
  const { skipPush, dryRun } = parseArgs(process.argv.slice(2));

  console.log('\n[publish-github] Pre-flight checks');
  runNode(path.join(repoRoot, 'scripts', 'verify-secrets-not-tracked.mjs'));
  runNode(path.join(repoRoot, 'Web_Toolkit', 'privacy_check', 'bin', 'privacy-check.mjs'), [
    'scan',
    '--root',
    path.join(repoRoot, 'Web_Toolkit'),
    '--json',
  ]);

  loadGhTokenFromEnvFile();
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    console.warn('\n[publish-github] No GH_TOKEN in environment or .env — gh may require `gh auth login`');
  }

  if (!skipPush) {
    console.log('\n[publish-github] Pushing to origin');
    gitPush(dryRun);
  }

  console.log('\n[publish-github] Applying GitHub description + topics');
  const topicArgs = dryRun ? ['--dry-run'] : [];
  runNode(path.join(repoRoot, 'scripts', 'set-github-topics.mjs'), topicArgs);

  console.log('\n[publish-github] Complete.');
}

main();
