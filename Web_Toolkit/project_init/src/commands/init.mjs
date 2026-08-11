// ./Web_Toolkit/project_init/src/commands/init.mjs
/**
 * Non-destructive project bootstrap workflows.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolvePortableRoot, resolveRuntimePath, resolveSiteProfilePath } from '../../../shared/lib/context.mjs';
import {
  buildProjectEnvExample,
  normalizeProjectName,
  renderProjectGitignore,
  renderProjectMemory,
  renderProjectReadme
} from '../../../shared/lib/project-bootstrap.mjs';

const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);
const CANONICAL_DOCS = ['README.md', 'AGENTS.md', 'OPERATIONS.md', 'ARCHITECTURE.md', 'RUNBOOKS.md', 'CHECKLIST.md', 'MEMORY.md'];

function fileExists(targetPath) {
  return Boolean(targetPath && fs.existsSync(targetPath));
}

function findAstroConfig(projectRoot) {
  return ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.cjs']
    .map((name) => path.join(projectRoot, name))
    .find((candidate) => fs.existsSync(candidate)) || '';
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function resolveProjectContext(flags = {}) {
  const explicitRoot = String(flags['project-root'] || '').trim();
  const projectRoot = path.resolve(explicitRoot || process.cwd());
  const profilePath = resolveSiteProfilePath({ portableRoot: PORTABLE_ROOT, flags, requireProfile: false });
  const profile = profilePath ? JSON.parse(fs.readFileSync(profilePath, 'utf8')) : null;
  const projectName = normalizeProjectName(projectRoot, String(flags['project-name'] || '').trim());
  return { projectRoot, profilePath, profile, projectName };
}

function resolveOutputDir(projectRoot, projectExists, flags = {}, mode = 'audit') {
  const explicit = String(flags['output-root'] || '').trim();
  if (explicit) return path.resolve(explicit);
  if (mode === 'apply-safe' && projectExists) return path.join(projectRoot, 'output');
  return resolveRuntimePath(PORTABLE_ROOT, 'project-init');
}

function collectState(context, flags = {}, mode = 'audit') {
  const { projectRoot, profilePath, profile } = context;
  const projectExists = fs.existsSync(projectRoot);
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const astroConfigPath = findAstroConfig(projectRoot);
  return {
    ...context,
    generatedAt: new Date().toISOString(),
    portableRoot: PORTABLE_ROOT,
    portableDocsComplete: CANONICAL_DOCS.every((name) => fileExists(path.join(PORTABLE_ROOT, name))),
    projectExists,
    readmePath: path.join(projectRoot, 'README.md'),
    memoryPath: path.join(projectRoot, 'MEMORY.md'),
    gitignorePath: path.join(projectRoot, '.gitignore'),
    envExamplePath: path.join(projectRoot, '.env.example'),
    envPath: path.join(projectRoot, '.env'),
    packageJsonPath,
    packageJsonExists: projectExists && fileExists(packageJsonPath),
    astroConfigPath,
    astroConfigExists: Boolean(astroConfigPath),
    nodeModulesPath: path.join(projectRoot, 'node_modules'),
    nodeModulesExists: projectExists && fileExists(path.join(projectRoot, 'node_modules')),
    profilePath,
    profileLinked: Boolean(profilePath),
    deployTarget: String(profile?.deployTarget || '').trim().toLowerCase(),
    outputDir: resolveOutputDir(projectRoot, projectExists, flags, mode)
  };
}

function buildNextSteps(state) {
  const nextSteps = [];
  if (!state.projectExists) nextSteps.push('Create the project root folder or run apply-safe so the toolkit can scaffold safe starter files.');
  if (!state.profileLinked) nextSteps.push('Create or link a site profile with init-site-profile before live domain/deploy work.');
  if (!fileExists(state.readmePath)) nextSteps.push('Create a project README.md so future sessions have an operator-facing synopsis.');
  if (!fileExists(state.memoryPath)) nextSteps.push('Create a project MEMORY.md so future sessions can resume cleanly.');
  if (!fileExists(state.gitignorePath)) nextSteps.push('Add a project .gitignore before generating builds, caches, or local env files.');
  if (!fileExists(state.envExamplePath)) nextSteps.push('Create a project root .env.example so required keys are explicit.');
  if (!fileExists(state.envPath)) nextSteps.push('Create the project root .env before live deploy or Cloudflare integration work.');
  if (!state.packageJsonExists) nextSteps.push('Add the web app scaffold (package.json and source files) or clone/import the actual site code.');
  if (state.packageJsonExists && !state.astroConfigExists) nextSteps.push('Add or confirm Astro config before using Astro-specific setup flows.');
  if (state.packageJsonExists && !state.nodeModulesExists) nextSteps.push('Install dependencies after the package manifest is ready.');
  return nextSteps;
}

function renderMarkdown(state, nextSteps = []) {
  const lines = [
    '# Project Init Report',
    '',
    `- Generated: ${state.generatedAt}`,
    `- Project root: ${state.projectRoot}`,
    `- Project name: ${state.projectName}`,
    `- Site profile: ${state.profilePath || 'not linked'}`,
    '',
    '## Summary',
    '',
    `- Portable canonical docs complete: ${state.portableDocsComplete}`,
    `- Project root exists: ${state.projectExists}`,
    `- README.md present: ${fileExists(state.readmePath)}`,
    `- MEMORY.md present: ${fileExists(state.memoryPath)}`,
    `- .gitignore present: ${fileExists(state.gitignorePath)}`,
    `- .env.example present: ${fileExists(state.envExamplePath)}`,
    `- .env present: ${fileExists(state.envPath)}`,
    `- Site profile linked: ${state.profileLinked}`,
    `- package.json present: ${state.packageJsonExists}`,
    `- Astro config present: ${state.astroConfigExists}`,
    `- node_modules present: ${state.nodeModulesExists}`,
    ''
  ];

  lines.push('## Pending / Next Steps', '');
  if (nextSteps.length === 0) {
    lines.push('- No obvious bootstrap gaps detected.');
  } else {
    for (const step of nextSteps) lines.push(`- ${step}`);
  }
  lines.push('');
  return `${lines.join('\n')}`;
}

function writeReport(state) {
  ensureDir(state.outputDir);
  const stamp = state.generatedAt.replace(/[:.]/g, '-');
  const base = state.projectExists
    ? `project-init-report-${stamp}`
    : `project-init-report-${state.projectName.replace(/\s+/g, '-').toLowerCase()}-${stamp}`;
  const jsonPath = path.join(state.outputDir, `${base}.json`);
  const markdownPath = path.join(state.outputDir, `${base}.md`);
  const nextSteps = buildNextSteps(state);
  const report = {
    generatedAt: state.generatedAt,
    projectRoot: state.projectRoot,
    projectName: state.projectName,
    siteProfile: state.profilePath || '',
    summary: {
      portableCanonicalDocsComplete: state.portableDocsComplete,
      projectExists: state.projectExists,
      readmePresent: fileExists(state.readmePath),
      memoryPresent: fileExists(state.memoryPath),
      gitignorePresent: fileExists(state.gitignorePath),
      envExamplePresent: fileExists(state.envExamplePath),
      envPresent: fileExists(state.envPath),
      profileLinked: state.profileLinked,
      packageJsonPresent: state.packageJsonExists,
      astroConfigPresent: state.astroConfigExists,
      nodeModulesPresent: state.nodeModulesExists
    },
    nextSteps
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMarkdown(state, nextSteps), 'utf8');
  return { jsonPath, markdownPath, nextSteps };
}

function writeIfMissing(filePath, content, actions) {
  if (fs.existsSync(filePath)) return;
  fs.writeFileSync(filePath, content, 'utf8');
  actions.push(`Created ${filePath}`);
}

function runAstroSafeFix(state, flags = {}, actions = []) {
  if (!state.packageJsonExists) return;
  const astroSetupCli = path.join(PORTABLE_ROOT, 'Setup_astro_environment', 'bin', 'astro-env-setup.mjs');
  const args = [astroSetupCli, 'fix', '--project-root', state.projectRoot, '--skip-install', flags['install-deps'] ? 'false' : 'true'];
  if (state.profilePath) {
    args.push('--site-profile', state.profilePath);
  }
  const result = spawnSync('node', args, { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'astro-env-setup fix failed during project-init apply-safe');
  }
  if ((result.stdout || '').includes('Applied')) {
    actions.push('Ran astro-env-setup fix for project-safe env/dependency remediation.');
  }
}

function runSkillSymlinkSafe(state, flags = {}, actions = []) {
  const managerCliCandidates = [
    path.join(PORTABLE_ROOT, 'scripts', 'manage-project-skills.mjs'),
    path.join(PORTABLE_ROOT, '..', 'scripts', 'manage-project-skills.mjs'),
  ];
  const managerCli = managerCliCandidates.find((candidate) => fs.existsSync(candidate));
  if (!managerCli) return;
  const result = spawnSync(
    process.execPath,
    [
      managerCli,
      'link',
      '--project',
      state.projectRoot,
      // Explicit project-scoped set for a new toolkit site (not skill-pack defaults).
      '--skills',
      'site-onboarding,portable-web-toolkit,site-readiness,site-starter,site-maintenance,wcag-auditor,pagespeed-diagnostics,discovery-doctor,toolkit-update',
    ],
    { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' },
  );
  if (result.status === 0) {
    actions.push(`Symlinked required agent skills into ${path.join(state.projectRoot, '.agents', 'skills')}`);
    return;
  }
  const detail = (result.stderr || result.stdout || 'unknown error').trim();
  throw new Error(`manage-project-skills link failed (exit ${result.status}): ${detail}`);
}

export async function runAudit(flags = {}) {
  const state = collectState(resolveProjectContext(flags), flags, 'audit');
  const { jsonPath, markdownPath, nextSteps } = writeReport(state);
  console.log('\nProject init audit');
  console.log(`- Project root: ${state.projectRoot}`);
  console.log(`- Site profile: ${state.profilePath || 'not linked'}`);
  console.log(`- Next steps: ${nextSteps.length}`);
  console.log(`- JSON: ${jsonPath}`);
  console.log(`- Markdown: ${markdownPath}`);
  return 0;
}

export async function runApplySafe(flags = {}) {
  const state = collectState(resolveProjectContext(flags), flags, 'apply-safe');
  const actions = [];

  ensureDir(state.projectRoot);
  if (!state.projectExists) actions.push(`Created project root ${state.projectRoot}`);

  writeIfMissing(state.readmePath, renderProjectReadme(state), actions);
  writeIfMissing(state.memoryPath, renderProjectMemory(state), actions);
  writeIfMissing(state.gitignorePath, renderProjectGitignore(), actions);
  writeIfMissing(state.envExamplePath, buildProjectEnvExample({ projectRoot: state.projectRoot, profile: state.profile }), actions);

  const refreshedState = collectState(resolveProjectContext({ ...flags, 'project-root': state.projectRoot, 'site-profile': state.profilePath || flags['site-profile'] || '' }), flags, 'apply-safe');
  runAstroSafeFix(refreshedState, flags, actions);
  runSkillSymlinkSafe(refreshedState, flags, actions);

  const { jsonPath, markdownPath, nextSteps } = writeReport(collectState(resolveProjectContext({ ...flags, 'project-root': state.projectRoot, 'site-profile': state.profilePath || flags['site-profile'] || '' }), flags, 'apply-safe'));

  console.log('\nProject init apply-safe');
  console.log(`- Project root: ${state.projectRoot}`);
  console.log(`- Actions: ${actions.length}`);
  for (const action of actions) console.log(`  - ${action}`);
  console.log(`- Next steps: ${nextSteps.length}`);
  console.log(`- JSON: ${jsonPath}`);
  console.log(`- Markdown: ${markdownPath}`);
  return 0;
}

