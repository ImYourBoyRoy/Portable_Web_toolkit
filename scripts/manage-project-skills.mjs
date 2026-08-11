#!/usr/bin/env node
// ./scripts/manage-project-skills.mjs
/**
 * Cross-platform manager for linking Portable Web Toolkit skills into project scope (.agents/skills/).
 *
 * Usage:
 *   node scripts/manage-project-skills.mjs link --project <dir> [--skills portable-web-toolkit,site-readiness]
 *   node scripts/manage-project-skills.mjs unlink --project <dir> [--skills ...]
 *   node scripts/manage-project-skills.mjs status --project <dir>
 *
 * Features:
 *   - Symlinks skills from Portable_Web_toolkit/skills/<name> into <project>/.agents/skills/<name>.
 *   - Works across POSIX (Linux/macOS) and Windows (Junctions).
 *   - Agent-agnostic (.agents/skills/ is recognized by Antigravity, Cursor, Claude Code, Codex, Copilot, etc.).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, '..');
const toolkitSkillsDir = path.join(repoRoot, 'skills');

function readManifest() {
  const manifestPath = path.join(repoRoot, 'skill-pack.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function parseArgs(argv) {
  const args = {
    command: 'status',
    project: process.cwd(),
    skills: [],
    json: false,
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const lower = token.toLowerCase();

    if (['link', 'unlink', 'status'].includes(lower)) {
      args.command = lower;
    } else if (['--project', '-p'].includes(lower)) {
      args.project = path.resolve(argv[i + 1]);
      i += 1;
    } else if (['--skills', '-s'].includes(lower)) {
      const val = argv[i + 1] || '';
      args.skills = val.split(',').map((s) => s.trim()).filter(Boolean);
      i += 1;
    } else if (token === '--auto') {
      args.auto = true;
    } else if (token === '--json') {
      args.json = true;
    } else if (token === '--force') {
      args.force = true;
    } else if (token === '--help' || token === '-h') {
      console.log(`
Usage: node manage-project-skills.mjs [link|unlink|status] [options]

Commands:
  link     Symlink skills from toolkit into <project>/.agents/skills/
  unlink   Remove skill symlinks from <project>/.agents/skills/
  status   Report symlink status for <project>/.agents/skills/

Options:
  --project, -p <dir>   Target project directory (default: current working directory)
  --skills, -s <list>   Comma-separated skills (default: only install_by_default=true → portable-web-toolkit-router)
  --json                Output results in JSON format
  --force               Overwrite non-symlink target directories if linking
`);
      process.exit(0);
    }
  }

  return args;
}

function getAvailableSkills() {
  if (!fs.existsSync(toolkitSkillsDir)) return [];
  return fs.readdirSync(toolkitSkillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function detectOptionalSkills(targetProjectDir) {
  const optional = [];
  const envPath = path.join(targetProjectDir, '.env');
  const feedPath = path.join(targetProjectDir, 'src', 'data', 'instagram', 'feed.json');
  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, 'utf8');
    if (envText.includes('INSTAGRAM_USERNAME')) optional.push('instagram-clone');
  }
  if (fs.existsSync(feedPath) && !optional.includes('instagram-clone')) {
    optional.push('instagram-clone');
  }
  return optional;
}

function resolveSkillsToProcess(requestedSkills, targetProjectDir = '', autoDetect = false) {
  const manifest = readManifest();
  const available = getAvailableSkills();

  if (requestedSkills && requestedSkills.length > 0) {
    const invalid = requestedSkills.filter((s) => !available.includes(s));
    if (invalid.length > 0) {
      throw new Error(`Unknown skill(s): ${invalid.join(', ')}. Available: ${available.join(', ')}`);
    }
    return requestedSkills;
  }

  const selected = manifest.skills
    .filter((entry) => entry.install_by_default)
    .map((entry) => entry.name);

  if (autoDetect && targetProjectDir) {
    const detected = detectOptionalSkills(targetProjectDir);
    for (const skill of detected) {
      if (available.includes(skill) && !selected.includes(skill)) {
        selected.push(skill);
      }
    }
  }

  return selected;
}

function linkSkill(targetProjectDir, skillName, force) {
  const targetDir = path.join(targetProjectDir, '.agents', 'skills');
  const sourcePath = path.join(toolkitSkillsDir, skillName);
  const targetPath = path.join(targetDir, skillName);

  if (!fs.existsSync(sourcePath)) {
    return { skill: skillName, status: 'error', message: `Source skill missing: ${sourcePath}` };
  }

  fs.mkdirSync(targetDir, { recursive: true });

  if (fs.existsSync(targetPath) || isSymlink(targetPath)) {
    const isSym = isSymlink(targetPath);
    if (isSym) {
      const currentTarget = path.resolve(path.dirname(targetPath), fs.readlinkSync(targetPath));
      if (currentTarget === path.resolve(sourcePath)) {
        return { skill: skillName, status: 'already-linked', targetPath };
      }
      fs.unlinkSync(targetPath);
    } else {
      if (!force) {
        return {
          skill: skillName,
          status: 'conflict',
          message: `Target is an existing directory. Pass --force to replace with symlink.`,
        };
      }
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  }

  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(sourcePath, targetPath, symlinkType);

  return { skill: skillName, status: 'linked', targetPath, symlinkType };
}

function unlinkSkill(targetProjectDir, skillName) {
  const targetPath = path.join(targetProjectDir, '.agents', 'skills', skillName);

  if (!fs.existsSync(targetPath) && !isSymlink(targetPath)) {
    return { skill: skillName, status: 'not-found' };
  }

  if (!isSymlink(targetPath)) {
    return { skill: skillName, status: 'skipped', message: 'Target is a regular directory, not a symlink' };
  }

  fs.unlinkSync(targetPath);
  return { skill: skillName, status: 'unlinked' };
}

function checkStatus(targetProjectDir, skillsToProcess) {
  const targetDir = path.join(targetProjectDir, '.agents', 'skills');
  const results = [];

  for (const skillName of skillsToProcess) {
    const sourcePath = path.join(toolkitSkillsDir, skillName);
    const targetPath = path.join(targetDir, skillName);

    if (!fs.existsSync(targetPath) && !isSymlink(targetPath)) {
      results.push({ skill: skillName, status: 'missing', targetPath });
      continue;
    }

    if (isSymlink(targetPath)) {
      try {
        const linkTarget = fs.readlinkSync(targetPath);
        const resolvedTarget = path.resolve(path.dirname(targetPath), linkTarget);
        if (resolvedTarget === path.resolve(sourcePath)) {
          results.push({ skill: skillName, status: 'linked', targetPath, linkTarget });
        } else {
          results.push({ skill: skillName, status: 'external-symlink', targetPath, linkTarget });
        }
      } catch (err) {
        results.push({ skill: skillName, status: 'broken-symlink', targetPath, error: err.message });
      }
    } else {
      results.push({ skill: skillName, status: 'directory-copy', targetPath });
    }
  }

  return results;
}

function isSymlink(filePath) {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const skillsToProcess = resolveSkillsToProcess(args.skills, args.project, args.auto);

  let results = [];

  if (args.command === 'link') {
    for (const skill of skillsToProcess) {
      results.push(linkSkill(args.project, skill, args.force));
    }
  } else if (args.command === 'unlink') {
    for (const skill of skillsToProcess) {
      results.push(unlinkSkill(args.project, skill));
    }
  } else {
    results = checkStatus(args.project, skillsToProcess);
  }

  if (args.json) {
    console.log(JSON.stringify({ project: args.project, command: args.command, results }, null, 2));
  } else {
    console.log(`[manage-project-skills] Command: ${args.command} | Project: ${args.project}`);
    for (const res of results) {
      const msg = res.message ? ` (${res.message})` : '';
      console.log(` - ${res.skill}: ${res.status}${msg}`);
    }
  }
}

try {
  main();
} catch (err) {
  console.error(`[manage-project-skills] Error: ${err.message}`);
  process.exitCode = 1;
}
