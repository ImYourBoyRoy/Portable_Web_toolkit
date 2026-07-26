import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptsDir, '..');
export const skillsRoot = path.join(repoRoot, 'skills');
export const manifestPath = path.join(repoRoot, 'skill-pack.json');

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function readManifest() {
  return readJson(manifestPath);
}

export function listFiles(root) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) {
        throw new Error(`symlink is not allowed in a skill tree: ${target}`);
      }
      if (stat.isDirectory()) {
        visit(target);
      } else if (stat.isFile()) {
        files.push(target);
      } else {
        throw new Error(`special file is not allowed in a skill tree: ${target}`);
      }
    }
  }
  visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

export function treeDigest(root) {
  const digest = crypto.createHash('sha256');
  for (const filePath of listFiles(root)) {
    const relative = path.relative(root, filePath).split(path.sep).join('/');
    const name = Buffer.from(relative, 'utf8');
    const data = fs.readFileSync(filePath);
    const nameLength = Buffer.alloc(8);
    nameLength.writeBigUInt64BE(BigInt(name.length));
    const dataLength = Buffer.alloc(8);
    dataLength.writeBigUInt64BE(BigInt(data.length));
    digest.update(nameLength);
    digest.update(name);
    digest.update(dataLength);
    digest.update(data);
  }
  return digest.digest('hex');
}

export function parseFrontmatter(skillPath) {
  const text = fs.readFileSync(skillPath, 'utf8');
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') throw new Error(`${skillPath}: missing frontmatter`);
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error(`${skillPath}: unclosed frontmatter`);
  const fields = {};
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue;
    const split = line.indexOf(':');
    if (split < 1) throw new Error(`${skillPath}: invalid frontmatter line`);
    const key = line.slice(0, split).trim();
    const value = line.slice(split + 1).trim().replace(/^['"]|['"]$/g, '');
    if (Object.hasOwn(fields, key)) {
      throw new Error(`${skillPath}: duplicate frontmatter field ${key}`);
    }
    fields[key] = value;
  }
  return { fields, body: lines.slice(end + 1).join('\n') };
}

export function skillDirectories() {
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}
