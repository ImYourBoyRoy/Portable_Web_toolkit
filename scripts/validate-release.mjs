#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { readJson, repoRoot } from './skill-lib.mjs';
import { parseSemver } from './version-lib.mjs';

const errors = [];
const releaseVersion = fs.readFileSync(
  path.join(repoRoot, 'VERSION'),
  'utf8',
).trim();

function requireVersion(label, value) {
  if (!parseSemver(value)) errors.push(`${label}: invalid semantic version`);
  if (value !== releaseVersion) {
    errors.push(`${label}: expected ${releaseVersion}, found ${value}`);
  }
}

if (!parseSemver(releaseVersion)) errors.push('VERSION is not semantic versioning');

const rootPackage = readJson(path.join(repoRoot, 'package.json'));
const toolkitPackage = readJson(path.join(repoRoot, 'Web_Toolkit', 'package.json'));
const plugin = readJson(path.join(repoRoot, 'plugin.json'));
const claudePlugin = readJson(
  path.join(repoRoot, '.claude-plugin', 'plugin.json'),
);
const skillPack = readJson(path.join(repoRoot, 'skill-pack.json'));

requireVersion('package.json', rootPackage.version);
requireVersion('Web_Toolkit/package.json', toolkitPackage.version);
requireVersion('plugin.json', plugin.version);
requireVersion('.claude-plugin/plugin.json', claudePlugin.version);
requireVersion('skill-pack.json toolkit_version', skillPack.toolkit_version);

for (const [label, metadata] of [
  ['package.json', rootPackage],
  ['Web_Toolkit/package.json', toolkitPackage],
  ['plugin.json', plugin],
  ['.claude-plugin/plugin.json', claudePlugin],
]) {
  if (metadata.license !== 'MIT') errors.push(`${label}: license must be MIT`);
}

const modulesRoot = path.join(repoRoot, 'Web_Toolkit');
for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || ['.runtime', 'node_modules'].includes(entry.name)) {
    continue;
  }
  const packagePath = path.join(modulesRoot, entry.name, 'package.json');
  if (!fs.existsSync(packagePath)) continue;
  const metadata = readJson(packagePath);
  const label = path.relative(repoRoot, packagePath);
  if (!metadata.name) errors.push(`${label}: package name is required`);
  if (!parseSemver(metadata.version)) {
    errors.push(`${label}: version must be semantic versioning`);
  }
  if (metadata.private !== true) errors.push(`${label}: must remain private`);
  if (metadata.license !== 'MIT') errors.push(`${label}: license must be MIT`);
}

const license = fs.readFileSync(path.join(repoRoot, 'LICENSE'), 'utf8');
if (!license.startsWith('MIT License')) errors.push('LICENSE is not MIT');

const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## [${releaseVersion}] - `)) {
  errors.push(`CHANGELOG.md has no dated ${releaseVersion} release entry`);
}
const releaseNotesPath = path.join(
  repoRoot,
  'docs',
  'releases',
  `v${releaseVersion}.md`,
);
if (!fs.existsSync(releaseNotesPath)) {
  errors.push(`missing release notes: docs/releases/v${releaseVersion}.md`);
}

for (const error of errors) console.error(`ERROR: ${error}`);
console.log(JSON.stringify({
  version: releaseVersion,
  modules: fs.readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => (
      entry.isDirectory()
      && fs.existsSync(path.join(modulesRoot, entry.name, 'package.json'))
    ))
    .length,
  errors: errors.length,
}));
process.exitCode = errors.length ? 1 : 0;
