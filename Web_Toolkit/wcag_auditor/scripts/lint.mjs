import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = await walk(root);
const errors = [];

for (const file of files) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const extension = path.extname(file);
  if (['.mjs', '.js', '.json', '.md', '.d.ts', '.gd', '.rs'].includes(extension) || ['LICENSE', 'README.md'].includes(path.basename(file))) {
    const content = await fs.readFile(file, 'utf8');
    if (!content.endsWith('\n')) errors.push(`${relative}: missing final newline`);
    if (/\0/.test(content)) errors.push(`${relative}: contains a NUL byte`);
    content.split('\n').forEach((line, index) => {
      if (/[ \t]+$/.test(line)) errors.push(`${relative}:${index + 1}: trailing whitespace`);
    });
    if (relative !== 'scripts/lint.mjs' && /\b(?:TODO|FIXME|HACK)\b/.test(content)) errors.push(`${relative}: unresolved task marker`);
  }

  if (extension === '.json') {
    try {
      JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      errors.push(`${relative}: invalid JSON: ${error.message}`);
    }
  }

  if (extension === '.mjs' || extension === '.js') {
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (check.status !== 0) errors.push(`${relative}: syntax check failed\n${check.stderr}`);
    const content = await fs.readFile(file, 'utf8');
    for (const match of content.matchAll(/(?:from\s+|import\s*\()(['"])(\.{1,2}\/[^'"]+)\1/g)) {
      const specifier = match[2];
      const candidate = path.resolve(path.dirname(file), specifier);
      if (!(await exists(candidate))) errors.push(`${relative}: local import does not exist: ${specifier}`);
    }
  }
}

const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const constants = await fs.readFile(path.join(root, 'src/core/constants.mjs'), 'utf8');
assert.match(constants, new RegExp(`TOOLKIT_VERSION = '${escapeRegExp(packageJson.version)}'`));
const cliStat = await fs.stat(path.join(root, 'src/cli.mjs'));
if ((cliStat.mode & 0o111) === 0) errors.push('src/cli.mjs: executable bit is not set');

for (const directory of ['src', 'scripts', 'tests']) {
  for (const file of files.filter((candidate) => candidate.startsWith(path.join(root, directory)))) {
    if (path.relative(root, file).split(path.sep).join('/') === 'scripts/lint.mjs') continue;
    const content = await fs.readFile(file, 'utf8');
    if (/@wcag\/standalone-auditor|@roydawsoniv\/a11y-toolkit|\bgp\/|Glass Providence|AAA PASS|100%25_Compliant/i.test(content)) {
      errors.push(`${path.relative(root, file)}: stale implementation, branding, or unsupported conformance label detected`);
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Lint passed: ${files.length} files checked with zero errors or warnings.\n`);
}

async function walk(directory) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.wcag-audit-results'].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(target));
    else if (entry.isFile()) output.push(target);
  }
  return output.sort();
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
