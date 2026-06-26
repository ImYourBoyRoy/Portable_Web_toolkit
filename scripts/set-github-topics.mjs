#!/usr/bin/env node
// ./scripts/set-github-topics.mjs
/**
 * Apply GitHub repository description and topics from docs/github-repository.json.
 *
 * Auth: gh auth login, or GH_TOKEN / GITHUB_TOKEN in environment or repo root `.env` (gitignored).
 *
 * Run:
 *   node ./scripts/set-github-topics.mjs
 *   node ./scripts/set-github-topics.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from '../Web_Toolkit/shared/lib/env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'docs', 'github-repository.json');

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run') || argv.includes('-n') };
}

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config: ${configPath}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const repository = String(config.repository || '').trim();
  const description = String(config.description || '').trim();
  const topics = Array.isArray(config.topics)
    ? config.topics.map((topic) => String(topic || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (!repository) throw new Error('docs/github-repository.json must include repository');
  if (topics.length === 0) throw new Error('docs/github-repository.json must include topics[]');
  if (topics.length > 20) throw new Error(`GitHub allows max 20 topics; got ${topics.length}`);
  return { repository, description, topics };
}

function ensureGhToken() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return;
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) return;
  const values = loadEnvFile(envPath);
  const token = String(values.GH_TOKEN || values.GITHUB_TOKEN || '').trim();
  if (token) {
    process.env.GH_TOKEN = token;
  }
}

function ghAvailable() {
  const result = spawnSync('gh', ['--version'], { encoding: 'utf8' });
  return result.status === 0;
}

function ghAuthOk() {
  ensureGhToken();
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return true;
  const result = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  return result.status === 0;
}

function runGh(args, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] gh ${args.join(' ')}`);
    return 0;
  }
  ensureGhToken();
  const result = spawnSync('gh', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    env: process.env,
  });
  return typeof result.status === 'number' ? result.status : 1;
}

function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const { repository, description, topics } = loadConfig();

  console.log('\n[set-github-topics]');
  console.log(`- Repository: ${repository}`);
  console.log(`- Description: ${description}`);
  console.log(`- Topics (${topics.length}): ${topics.join(', ')}`);

  if (!ghAvailable()) {
    throw new Error('GitHub CLI (gh) not found. Install from https://cli.github.com/');
  }
  if (!dryRun && !ghAuthOk()) {
    throw new Error('Not authenticated. Set GH_TOKEN in gitignored .env or run: gh auth login');
  }

  const editArgs = ['repo', 'edit', repository];
  if (description) {
    editArgs.push('--description', description);
  }
  for (const topic of topics) {
    editArgs.push('--add-topic', topic);
  }

  const code = runGh(editArgs, dryRun);
  if (code !== 0) {
    process.exit(code);
  }

  if (!dryRun) {
    runGh(['repo', 'view', repository, '--json', 'description,repositoryTopics,visibility'], false);
  }

  console.log('\nDone.');
}

try {
  main();
} catch (error) {
  console.error('\n[set-github-topics] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
