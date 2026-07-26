#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  listFiles,
  parseFrontmatter,
  readJson,
  readManifest,
  repoRoot,
  skillDirectories,
  skillsRoot,
  treeDigest,
} from './skill-lib.mjs';

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const PORTABILITY_PATTERNS = [
  ['absolute Linux home', /\/home\/[A-Za-z0-9_.-]+\//],
  ['absolute macOS home', /\/Users\/[A-Za-z0-9_.-]+\//],
  ['absolute Windows user', /[A-Za-z]:\\Users\\[A-Za-z0-9_. -]+\\/i],
  ['private IPv4 address', /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/],
  ['email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
];

function main() {
  const manifest = readManifest();
  const activationCases = readJson(path.join(repoRoot, 'tests', 'activation-cases.json'));
  const errors = [];
  const warnings = [];
  if (manifest.schema !== 1) errors.push('manifest schema must be 1');
  if (!VERSION_RE.test(String(manifest.version || ''))) {
    errors.push('manifest version must use semantic versioning');
  }
  if (!Array.isArray(manifest.skills)) errors.push('manifest skills must be an array');

  const entries = Array.isArray(manifest.skills) ? manifest.skills : [];
  const names = entries.map((entry) => entry.name);
  const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  if (duplicates.length) errors.push(`duplicate manifest skills: ${duplicates.join(', ')}`);

  const actual = skillDirectories();
  const discoveryRootFiles = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => entry.name);
  if (discoveryRootFiles.length) {
    errors.push(
      `skills/ must contain only skill directories for native plugin compatibility: ${discoveryRootFiles.join(', ')}`,
    );
  }
  const expected = [...new Set(names)].sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !expected.includes(name));
  if (missing.length || extra.length) {
    errors.push(`skill inventory mismatch: missing=${missing.join(',') || '-'} extra=${extra.join(',') || '-'}`);
  }
  const activationNames = Object.keys(activationCases.skills || {}).sort();
  if (activationNames.join(',') !== expected.join(',')) {
    errors.push('activation-case inventory must exactly match the skill manifest');
  }

  for (const entry of entries) {
    const name = String(entry.name || '');
    if (!NAME_RE.test(name) || name.length > 64) {
      errors.push(`${name || '<unnamed>'}: invalid skill name`);
      continue;
    }
    if (!VERSION_RE.test(String(entry.version || ''))) {
      errors.push(`${name}: invalid skill version`);
    }
    if (!['core', 'optional'].includes(entry.tier)) {
      errors.push(`${name}: tier must be core or optional`);
    }
    if (!['stable', 'experimental', 'deprecated'].includes(entry.status)) {
      errors.push(`${name}: invalid status`);
    }
    if (typeof entry.install_by_default !== 'boolean') {
      errors.push(`${name}: install_by_default must be boolean`);
    }
    const cases = activationCases.skills?.[name];
    if (
      !Array.isArray(cases?.positive)
      || cases.positive.length < 1
      || !Array.isArray(cases?.near_miss)
      || cases.near_miss.length < 1
    ) {
      errors.push(`${name}: requires positive and near-miss activation cases`);
    }
    const expectedPath = `skills/${name}`;
    if (entry.path !== expectedPath) errors.push(`${name}: path must be ${expectedPath}`);

    const skillRoot = path.join(repoRoot, expectedPath);
    if (!fs.existsSync(skillRoot) || !fs.statSync(skillRoot).isDirectory()) {
      errors.push(`${name}: skill directory is missing`);
      continue;
    }
    try {
      const skillPath = path.join(skillRoot, 'SKILL.md');
      const { fields, body } = parseFrontmatter(skillPath);
      if (Object.keys(fields).sort().join(',') !== 'description,name') {
        errors.push(`${name}: SKILL.md frontmatter must contain only name and description`);
      }
      if (fields.name !== name) errors.push(`${name}: frontmatter name mismatch`);
      if (!fields.description || fields.description.length > 1024) {
        errors.push(`${name}: description must contain 1-1024 characters`);
      }
      if (body.trim().length < 120) errors.push(`${name}: skill body is unexpectedly small`);

      const metadata = readJson(path.join(skillRoot, 'skill.json'));
      if (
        metadata.schema !== 1
        || metadata.package !== manifest.package
        || metadata.name !== name
        || metadata.version !== entry.version
      ) {
        errors.push(`${name}: skill.json does not match the manifest`);
      }

      const openai = fs.readFileSync(path.join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
      if (!openai.includes(`$${name}`)) {
        errors.push(`${name}: agents/openai.yaml must explicitly invoke $${name}`);
      }

      const digest = treeDigest(skillRoot);
      if (entry.content_sha256 && entry.content_sha256 !== digest) {
        errors.push(`${name}: content_sha256 mismatch`);
      }
      if (!entry.content_sha256) warnings.push(`${name}: content_sha256 not recorded`);

      for (const absolute of listFiles(skillRoot)) {
        const filePath = path.relative(skillRoot, absolute);
        const text = fs.readFileSync(absolute, 'utf8');
        for (const [label, pattern] of PORTABILITY_PATTERNS) {
          if (pattern.test(text)) errors.push(`${name}/${filePath}: contains ${label}`);
        }
      }

      for (const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const reference = match[1].split('#')[0];
        if (!reference || /^[a-z][a-z0-9+.-]*:/i.test(reference)) continue;
        const resolved = path.resolve(skillRoot, reference);
        if (resolved !== skillRoot && !resolved.startsWith(`${skillRoot}${path.sep}`)) {
          errors.push(`${name}: reference escapes the skill directory: ${reference}`);
        } else if (!fs.existsSync(resolved)) {
          errors.push(`${name}: missing referenced file: ${reference}`);
        }
      }
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
  }

  for (const warning of warnings) console.warn(`WARNING: ${warning}`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  console.log(JSON.stringify({
    package: manifest.package,
    version: manifest.version,
    skills: actual.length,
    errors: errors.length,
    warnings: warnings.length,
  }));
  process.exitCode = errors.length ? 1 : 0;
}

main();
