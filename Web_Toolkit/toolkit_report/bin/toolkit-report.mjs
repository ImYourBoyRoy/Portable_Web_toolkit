#!/usr/bin/env node
// ./Web_Toolkit/toolkit_report/bin/toolkit-report.mjs
/**
 * Generates a concise project/toolkit readiness report.
 *
 * Use this when an AI model needs a fast summary of what is ready, what is
 * missing, and what should happen next for a target website project.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { resolvePortableRoot, resolveRuntimePath, loadSiteProfileContext } from '../../shared/lib/context.mjs';

const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 2);
const CANONICAL_DOCS = ['README.md', 'AGENTS.md', 'OPERATIONS.md', 'ARCHITECTURE.md', 'RUNBOOKS.md', 'CHECKLIST.md', 'MEMORY.md'];
const CORE_TOOLS = ['Setup_agent_environment', 'Setup_astro_environment', 'cloudflare-agent-toolkit', 'site_doctor', 'site_quality_smoke', 'browser_diagnostics', 'integration_doctor', 'cache_purge', 'toolkit_purge', 'toolkit_verify'];

function parseArgs(argv) {
  const command = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      command.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function printHelp() {
  return printStandardHelp({
    name: 'toolkit-report',
    summary: 'Generate a quick project/toolkit readiness report',
    usage: [
      'toolkit-report generate [--site-profile <profile>] [--project-root <path>] [--cloudflare]'
    ],
    commands: [
      { name: 'generate', description: 'Inspect toolkit docs, target project readiness, optional Cloudflare access, and pending next steps.' }
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Optional site profile for the target project.' },
      { name: '--project-root <path>', description: 'Optional target project root. Defaults from the site profile or current working directory.' },
      { name: '--cloudflare', description: 'Also run read-only Cloudflare checks when a site profile is supplied.' }
    ],
    examples: [
      'toolkit-report generate --project-root C:/sites/client-app',
      'toolkit-report generate --site-profile Web_Toolkit/site-profiles/example-workers.json --project-root . --cloudflare'
    ],
    notes: [
      'This command is non-mutating.',
      'It is intended as a fast handoff/status snapshot for models and operators.'
    ],
    exitCodes: [
      { name: '0', description: 'Report generated successfully.' },
      { name: '1', description: 'Unhandled failure.' }
    ]
  });
}

function fileExists(targetPath) {
  return Boolean(targetPath && fs.existsSync(targetPath));
}

function readJsonIfExists(targetPath) {
  if (!fileExists(targetPath)) return null;
  return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
}

function findAstroConfig(projectRoot) {
  return ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.cjs']
    .map((name) => path.join(projectRoot, name))
    .find((candidate) => fs.existsSync(candidate)) || '';
}

function detectPackageManager(projectRoot) {
  if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function runNode(args = []) {
  return spawnSync('node', args, { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' });
}

function parseJsonOutput(result) {
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout || '{}');
  } catch {
    return null;
  }
}

function boolFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function canonicalDocState() {
  return CANONICAL_DOCS.map((name) => ({ name, present: fileExists(path.join(PORTABLE_ROOT, name)) }));
}

function toolState() {
  return CORE_TOOLS.map((name) => ({ name, present: fileExists(path.join(PORTABLE_ROOT, name)) }));
}

function resolveProject(flags = {}) {
  if (flags['site-profile']) {
    const context = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags });
    return {
      projectRoot: context.projectRoot,
      profilePath: context.profilePath,
      profile: context.profile,
      env: context.env
    };
  }
  const explicitRoot = String(flags['project-root'] || process.cwd()).trim();
  return {
    projectRoot: path.resolve(explicitRoot),
    profilePath: '',
    profile: null,
    env: process.env
  };
}

function nextSteps(report = {}) {
  const steps = [];
  if (!report.project.exists) steps.push('Create or point to a real project root before using the toolkit.');
  if (!report.profile.present) steps.push('Create a site profile with init-site-profile before using site-specific diagnostics/deploy flows.');
  if (!report.project.packageJsonExists) steps.push('Initialize package.json / project dependencies before using Astro setup flows.');
  if (!report.project.astroConfigExists) steps.push('Add an Astro config before treating this as an Astro project.');
  if (!report.project.nodeModulesExists) steps.push('Run Setup_Astro_Environment fix (or npm install) to install dependencies.');
  if (!report.project.envExampleExists) steps.push('Add a project root .env.example documenting required settings.');
  if (!report.project.envExists) steps.push('Create the project root .env before live deploy/integration work.');
  if (!report.deploy.deployCommandsPresent) steps.push('Define deploy commands in the site profile before using portable deploy flows.');
  if (report.profile.present && report.profile.deployTarget === 'pages' && !report.deploy.pagesProjectPresent) steps.push('Set cloudflare.pagesProject in the site profile for Pages deployments.');
  if (report.profile.present && report.profile.deployTarget === 'workers' && !report.deploy.workerNamesPresent) steps.push('Set cloudflare.workerNames in the site profile for Workers deployments.');
  if (report.cloudflare.enabled && !report.cloudflare.allPassed) steps.push('Resolve Cloudflare auth/profile issues before using live Cloudflare workflows.');
  if (steps.length === 0) steps.push('No obvious blockers detected. Proceed with preview, diagnostics, and deploy flow as needed.');
  return steps;
}

function renderMarkdown(report = {}) {
  const lines = [
    '# Portable Toolkit Report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Project root: ${report.project.projectRoot}`,
    `- Site profile: ${report.profile.present ? report.profile.profilePath : 'missing'}`,
    `- Deploy target: ${report.profile.deployTarget || 'unknown'}`,
    '',
    '## Summary',
    '',
    `- Canonical docs complete: ${report.toolkit.canonicalDocsComplete}`,
    `- Core tools present: ${report.toolkit.coreToolsComplete}`,
    `- Project exists: ${report.project.exists}`,
    `- package.json present: ${report.project.packageJsonExists}`,
    `- Astro config present: ${report.project.astroConfigExists}`,
    `- node_modules present: ${report.project.nodeModulesExists}`,
    `- Project .env.example present: ${report.project.envExampleExists}`,
    `- Project .env present: ${report.project.envExists}`,
    `- Deploy commands present: ${report.deploy.deployCommandsPresent}`,
    '',
    '## Pending / Next Steps',
    ''
  ];
  for (const step of report.nextSteps || []) {
    lines.push(`- ${step}`);
  }
  lines.push('', '## Cloudflare Checks', '');
  if (!report.cloudflare.enabled) {
    lines.push('- Not requested.');
  } else {
    for (const item of report.cloudflare.results) {
      lines.push(`- ${item.name}: ${item.status === 0 ? 'PASS' : `FAIL (${item.status})`}`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const primary = String(command[0] || 'help').toLowerCase();
  if (['help', '--help', '-h'].includes(primary)) {
    printHelp();
    return 0;
  }
  if (primary !== 'generate') {
    printHelp();
    return 1;
  }

  const project = resolveProject(flags);
  const projectRoot = project.projectRoot;
  const packageJson = readJsonIfExists(path.join(projectRoot, 'package.json'));
  const agentDoctorArgs = ['Web_Toolkit/Setup_agent_environment/bin/agent-env-setup.mjs', 'doctor', '--workspace', projectRoot, '--json'];
  const astroDoctorArgs = ['Web_Toolkit/Setup_astro_environment/bin/astro-env-setup.mjs', 'doctor', '--project-root', projectRoot, '--json'];
  if (project.profilePath) astroDoctorArgs.push('--site-profile', project.profilePath);

  const agentDoctor = parseJsonOutput(runNode(agentDoctorArgs));
  const astroDoctor = parseJsonOutput(runNode(astroDoctorArgs));

  const report = {
    generatedAt: new Date().toISOString(),
    toolkit: {
      canonicalDocs: canonicalDocState(),
      canonicalDocsComplete: canonicalDocState().every((entry) => entry.present),
      coreTools: toolState(),
      coreToolsComplete: toolState().every((entry) => entry.present)
    },
    profile: {
      present: Boolean(project.profilePath),
      profilePath: project.profilePath,
      siteId: project.profile?.siteId || '',
      deployTarget: project.profile?.deployTarget || ''
    },
    project: {
      projectRoot,
      exists: fileExists(projectRoot),
      packageJsonExists: Boolean(packageJson),
      astroConfigExists: Boolean(findAstroConfig(projectRoot)),
      wranglerConfigExists: fileExists(path.join(projectRoot, 'wrangler.toml')),
      nodeModulesExists: fileExists(path.join(projectRoot, 'node_modules')),
      envExampleExists: fileExists(path.join(projectRoot, '.env.example')),
      envExists: fileExists(path.join(projectRoot, '.env')),
      devVarsExampleExists: fileExists(path.join(projectRoot, '.dev.vars.example')),
      devVarsExists: fileExists(path.join(projectRoot, '.dev.vars')),
      packageManager: detectPackageManager(projectRoot),
      scripts: packageJson?.scripts || {}
    },
    deploy: {
      deployCommandsPresent: Boolean(project.profile?.commands?.deploy?.development && project.profile?.commands?.deploy?.production),
      pagesProjectPresent: Boolean(project.profile?.cloudflare?.pagesProject),
      workerNamesPresent: Boolean(project.profile?.cloudflare?.workerNames?.production && project.profile?.cloudflare?.workerNames?.development)
    },
    doctors: {
      agent: agentDoctor,
      astro: astroDoctor
    },
    cloudflare: {
      enabled: boolFlag(flags.cloudflare),
      results: [],
      allPassed: !boolFlag(flags.cloudflare)
    }
  };

  if (report.cloudflare.enabled && project.profilePath) {
    const cfCommands = [
      { name: 'permissions audit', args: ['Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs', 'permissions', 'audit', '--site-profile', project.profilePath, '--project-root', projectRoot] },
      { name: 'site audit', args: ['Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs', 'site', 'audit', '--site-profile', project.profilePath, '--project-root', projectRoot] },
      { name: 'workers verify', args: ['Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs', 'workers', 'verify', '--site-profile', project.profilePath, '--project-root', projectRoot] }
    ];
    for (const commandDef of cfCommands) {
      const result = runNode(commandDef.args);
      report.cloudflare.results.push({ name: commandDef.name, status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' });
    }
    report.cloudflare.allPassed = report.cloudflare.results.every((entry) => entry.status === 0);
  }

  report.nextSteps = nextSteps(report);

  const outputDir = fileExists(projectRoot) ? path.join(projectRoot, 'output') : resolveRuntimePath(PORTABLE_ROOT, 'reports');
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `portable-toolkit-report-${stamp}.json`);
  const mdPath = path.join(outputDir, `portable-toolkit-report-${stamp}.md`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, renderMarkdown(report), 'utf8');

  console.log('\nPortable toolkit report');
  console.log(`- Project root: ${projectRoot}`);
  console.log(`- Site profile: ${report.profile.present ? report.profile.profilePath : 'missing'}`);
  console.log(`- Next steps: ${report.nextSteps.length}`);
  console.log(`- JSON: ${jsonPath}`);
  console.log(`- Markdown: ${mdPath}`);
  return 0;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error('\n[toolkit-report] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

