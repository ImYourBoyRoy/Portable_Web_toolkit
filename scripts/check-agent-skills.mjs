#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readJson,
  readManifest,
  repoRoot,
  treeDigest,
} from './skill-lib.mjs';

const CLIENTS = {
  codex: { user: ['.agents/skills'], project: ['.agents/skills'] },
  cursor: {
    user: ['.cursor/skills', '.agents/skills'],
    project: ['.cursor/skills', '.agents/skills'],
  },
  claude: { user: ['.claude/skills'], project: ['.claude/skills'] },
  gemini: { user: ['.gemini/skills'], project: ['.gemini/skills', '.agents/skills'] },
  kiro: { user: ['.kiro/skills'], project: ['.kiro/skills'] },
  copilot: {
    user: null,
    project: ['.github/skills', '.agents/skills', '.claude/skills'],
  },
  antigravity: {
    user: ['.gemini/config/skills'],
    project: ['.agents/skills'],
  },
  'antigravity-cli': {
    user: ['.gemini/antigravity-cli/skills'],
    project: ['.agents/skills'],
  },
};

function parseArgs(argv) {
  const result = {
    agents: [],
    scope: 'user',
    project: process.cwd(),
    skills: [],
    showPaths: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index].toLowerCase();
    const next = argv[index + 1];
    if (['--agent', '-agent'].includes(token)) {
      result.agents.push(String(next || '').toLowerCase());
      index += 1;
    } else if (['--scope', '-scope'].includes(token)) {
      result.scope = String(next || '').toLowerCase();
      index += 1;
    } else if (token === '--project') {
      result.project = next;
      index += 1;
    } else if (token === '--skill') {
      result.skills.push(next);
      index += 1;
    } else if (token === '--show-paths') {
      result.showPaths = true;
    } else if (token === '--apply') {
      throw new Error(
        'This helper is read-only. Follow docs/agent-skills/INSTALL_PROTOCOL.md for an authorized agent-driven installation.',
      );
    } else if (token === '--' || token === '--status') {
      continue;
    } else {
      throw new Error(`unknown argument: ${argv[index]}`);
    }
  }
  if (!['user', 'project'].includes(result.scope)) {
    throw new Error('scope must be user or project');
  }
  return result;
}

function safeDigest(root) {
  try {
    return treeDigest(root);
  } catch (error) {
    return { error: error.message };
  }
}

function displayRoot(root, base, scope, showPaths) {
  if (showPaths) return root;
  const relative = path.relative(base, root).split(path.sep).join('/');
  return scope === 'user' ? `~/${relative}` : `./${relative}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readManifest();
  const selectedNames = args.skills.length
    ? args.skills
    : manifest.skills.filter((entry) => entry.install_by_default).map((entry) => entry.name);
  const knownNames = new Set(manifest.skills.map((entry) => entry.name));
  const unknownSkills = selectedNames.filter((name) => !knownNames.has(name));
  if (unknownSkills.length) throw new Error(`unknown skills: ${unknownSkills.join(', ')}`);

  const agents = args.agents.length ? [...new Set(args.agents)] : Object.keys(CLIENTS);
  const unknownAgents = agents.filter((agent) => !CLIENTS[agent]);
  if (unknownAgents.length) throw new Error(`unknown agents: ${unknownAgents.join(', ')}`);

  const base = args.scope === 'user'
    ? os.homedir()
    : path.resolve(args.project);
  const results = [];
  for (const agent of agents) {
    const relativeRoots = CLIENTS[agent][args.scope];
    if (!relativeRoots) {
      results.push({ agent, scope: args.scope, status: 'unsupported-scope' });
      continue;
    }
    for (let rootIndex = 0; rootIndex < relativeRoots.length; rootIndex += 1) {
      const relativeRoot = relativeRoots[rootIndex];
      const targetRoot = path.join(base, relativeRoot);
      for (const name of selectedNames) {
        const source = path.join(repoRoot, 'skills', name);
        const target = path.join(targetRoot, name);
        const sourceDigest = treeDigest(source);
        let status = 'missing';
        let installedVersion = null;
        let detail = null;
        if (fs.existsSync(target)) {
          const stat = fs.lstatSync(target);
          if (stat.isSymbolicLink()) {
            try {
              const realTarget = fs.realpathSync(target);
              if (realTarget === path.resolve(source)) {
                status = 'current-symlink';
                const metadataPath = path.join(target, 'skill.json');
                if (fs.existsSync(metadataPath)) {
                  try {
                    installedVersion = readJson(metadataPath).version || null;
                  } catch {
                    detail = 'invalid skill.json';
                  }
                }
              } else {
                status = 'external-symlink';
                detail = `points to ${realTarget}`;
              }
            } catch {
              status = 'broken-symlink';
            }
          } else if (!stat.isDirectory()) {
            status = 'unmanaged-conflict';
          } else {
            const metadataPath = path.join(target, 'skill.json');
            if (fs.existsSync(metadataPath)) {
              try {
                installedVersion = readJson(metadataPath).version || null;
              } catch {
                detail = 'invalid skill.json';
              }
            }
            const installedDigest = safeDigest(target);
            if (typeof installedDigest === 'object') {
              status = 'unsafe-tree';
              detail = installedDigest.error;
            } else if (installedDigest === sourceDigest) {
              status = 'current';
            } else if (!installedVersion) {
              status = 'unmanaged-or-legacy';
            } else {
              status = 'different';
            }
          }
        }
        results.push({
          agent,
          scope: args.scope,
          skill: name,
          discovery: rootIndex === 0 ? 'primary' : 'alternative',
          source_version: manifest.skills.find((entry) => entry.name === name).version,
          installed_version: installedVersion,
          status,
          target: displayRoot(target, base, args.scope, args.showPaths),
          detail,
        });
      }
    }
  }

  const duplicateDiscovery = [];
  for (const agent of agents) {
    for (const skill of selectedNames) {
      const found = results.filter((entry) => (
        entry.agent === agent
        && entry.skill === skill
        && !['missing', 'unsupported-scope'].includes(entry.status)
      ));
      if (found.length > 1) {
        duplicateDiscovery.push({
          agent,
          skill,
          targets: found.map((entry) => entry.target),
        });
      }
    }
  }

  console.log(JSON.stringify({
    schema: 1,
    action: 'status',
    files_modified: false,
    clients_invoked: false,
    duplicate_discovery: duplicateDiscovery,
    results,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
