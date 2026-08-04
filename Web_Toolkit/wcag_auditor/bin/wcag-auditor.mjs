#!/usr/bin/env node
// ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs
/**
 * Portable Web Toolkit bridge for the standalone WCAG Auditor.
 *
 * Core package: @roydawsoniv/wcag-auditor (AI/wcag-auditor checkout or npm).
 * This CLI adds site-profile / Astro project conventions only.
 */

import fs from 'node:fs';
import path from 'node:path';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import {
  buildAstroConfigObject,
  writeAstroStarterFiles,
  writeEphemeralConfig
} from '../src/toolkit/profile-config.mjs';
import {
  importCore,
  outputPaths,
  resolveConfigPath,
  resolveCoreRoot,
  resolveProfile,
  resolveProjectRoot
} from '../src/toolkit/paths.mjs';

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseArgs(argv) {
  const command = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        index += 1;
      }
    } else {
      command.push(token);
    }
  }
  return { command, flags };
}

function printHelp(coreRoot = '') {
  return printStandardHelp({
    name: 'wcag-auditor (toolkit bridge)',
    summary: 'Site-profile bridge to standalone @roydawsoniv/wcag-auditor',
    usage: [
      'wcag-auditor run --site-profile <profile> [--project-root <path>] [--from-profile] [--manage-server]',
      'wcag-auditor run --project-root <path> [--config <file>]',
      'wcag-auditor init --site-profile <profile> [--force]',
      'wcag-auditor validate-config --site-profile <profile>',
      'wcag-auditor list-rules',
      'wcag-auditor explain <rule-id>',
      'wcag-auditor core-path'
    ],
    commands: [
      { name: 'run', description: 'Execute the standalone auditor against a toolkit-managed site.' },
      { name: 'init', description: 'Write Astro/site-profile-aware starter config + manual evidence template.' },
      { name: 'validate-config', description: 'Load and validate the accessibility configuration.' },
      { name: 'list-rules', description: 'List built-in rule metadata (delegates to core).' },
      { name: 'explain', description: 'Print one built-in rule definition as JSON (delegates to core).' },
      { name: 'core-path', description: 'Print the resolved standalone WCAG Auditor package root.' }
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Portable site profile JSON for the target site.' },
      { name: '--project-root <path>', description: 'Override the project root from the site profile.' },
      { name: '--config <file>', description: 'Explicit wcag-auditor config path (relative to project root).' },
      { name: '--from-profile', description: 'Build an ephemeral config from site-profile routes/hosts.' },
      { name: '--manage-server', description: 'Start profile commands.preview for profile-built configs.' },
      { name: '--base-url <url>', description: 'Override adapter baseURL (local preview).' },
      { name: '--force', description: 'Overwrite starter files during init.' },
      { name: '--quiet', description: 'Reduce console reporter noise.' },
      { name: '--no-color', description: 'Disable ANSI color in console output.' }
    ],
    examples: [
      'wcag-auditor init --site-profile ../site-profiles/example-workers.json',
      'wcag-auditor run --site-profile ../site-profiles/example-workers.json --base-url http://127.0.0.1:4321',
      'wcag-auditor run --site-profile ../site-profiles/example-workers.json --from-profile',
      'wcag-auditor core-path'
    ],
    notes: [
      'Core package lives outside this toolkit (default checkout: AI/wcag-auditor).',
      'Override with WCAG_AUDITOR_ROOT or npm install @roydawsoniv/wcag-auditor.',
      coreRoot ? `Resolved core: ${coreRoot}` : 'Run `wcag-auditor core-path` to see the resolved core location.',
      'This bridge does not certify WCAG conformance — it only wires site profiles to the evidence gate.',
      'For non-website apps (Tauri, native), use the standalone package directly.'
    ],
    exitCodes: [
      { name: '0', description: 'Configured gate passed.' },
      { name: '1', description: 'Blocking accessibility findings.' },
      { name: '2', description: 'Configuration, dependency, adapter, or empty-surface failure.' },
      { name: '3', description: 'Required evidence remains untested or inconclusive.' }
    ]
  });
}

async function runWithToolkit(flags, api) {
  const resolved = resolveProfile(flags, { requireProfile: Boolean(flags['site-profile'] || flags.profile) });
  const projectRoot = resolveProjectRoot(flags, resolved);
  const profile = resolved?.profile || {};
  const siteId = profile.siteId || path.basename(projectRoot);
  const paths = outputPaths(projectRoot, siteId);

  let configPath = null;
  if (toBool(flags['from-profile'], false)) {
    fs.mkdirSync(paths.outputDir, { recursive: true });
    const configObject = buildAstroConfigObject({
      profile,
      projectRoot,
      outputDirectory: paths.outputDir,
      flags,
      includeManualEvidence: false
    });
    configPath = writeEphemeralConfig(paths.ephemeralConfigPath, configObject);
    console.log(`[wcag-auditor] ephemeral config → ${configPath}`);
  } else {
    configPath = await resolveConfigPath(projectRoot, flags, profile);
    if (!configPath) {
      throw new Error(
        `No wcag-auditor.config.mjs found under ${projectRoot}. Run \`wcag-auditor init --site-profile <profile>\` or pass --from-profile.`
      );
    }
  }

  const config = await api.loadConfig(configPath, { cwd: projectRoot });
  if (toBool(flags['from-profile'], false) || flags['site-profile'] || flags.profile) {
    config.outputDirectory = paths.outputDir;
    fs.mkdirSync(paths.outputDir, { recursive: true });
  }

  const run = await api.runAccessibility(config, {
    configIsNormalized: true,
    quiet: toBool(flags.quiet, false),
    color: flags['no-color'] ? false : undefined,
    stream: process.stdout
  });

  console.log(`[wcag-auditor] core → ${resolveCoreRoot({ projectRoot })}`);
  console.log(`[wcag-auditor] reports → ${config.outputDirectory}`);
  console.log(`[wcag-auditor] gate exit → ${run.gate.exitCode} (${run.gate.status})`);
  return run.gate.exitCode;
}

async function initWithToolkit(flags) {
  let profile = {};
  let projectRoot = flags['project-root'] ? path.resolve(String(flags['project-root'])) : '';

  if (flags['site-profile'] || flags.profile) {
    const { resolvePortableRoot, resolveSiteProfilePath } = await import('../../shared/lib/context.mjs');
    const portableRoot = resolvePortableRoot(import.meta.url, 3);
    const profilePath = resolveSiteProfilePath({ portableRoot, flags, requireProfile: true });
    profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    if (!projectRoot) {
      const raw = String(profile.projectRoot || '').trim();
      projectRoot = raw
        ? (path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(path.dirname(profilePath), raw))
        : path.resolve(process.cwd());
    }
  }

  if (!projectRoot) projectRoot = path.resolve(process.cwd());
  fs.mkdirSync(projectRoot, { recursive: true });

  const marker = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(marker)) {
    fs.writeFileSync(
      marker,
      `${JSON.stringify({ name: profile.siteId || path.basename(projectRoot), private: true, type: 'module' }, null, 2)}\n`,
      'utf8'
    );
  }

  const files = await writeAstroStarterFiles(projectRoot, {
    profile,
    force: toBool(flags.force, false),
    includeManualEvidence: true
  });
  console.log(`[wcag-auditor] created ${files.configPath}`);
  if (files.evidencePath) console.log(`[wcag-auditor] created ${files.evidencePath}`);
  console.log(`[wcag-auditor] core → ${resolveCoreRoot({ projectRoot })}`);
  console.log('[wcag-auditor] edit scenarios/baseURL, install Playwright peers if needed, then run.');
  return 0;
}

async function validateWithToolkit(flags, api) {
  const resolved = resolveProfile(flags, { requireProfile: Boolean(flags['site-profile'] || flags.profile) });
  const projectRoot = resolveProjectRoot(flags, resolved);
  const configPath = await resolveConfigPath(projectRoot, flags, resolved?.profile || null);
  if (!configPath) throw new Error(`No accessibility configuration found from ${projectRoot}`);
  const config = await api.loadConfig(configPath, { cwd: projectRoot });
  console.log(`Valid configuration: ${config.configPath}`);
  console.log(`Project: ${config.project.name}`);
  console.log(`Adapters: ${config.adapters.length}`);
  console.log(`Output: ${config.outputDirectory}`);
  console.log(`Core: ${resolveCoreRoot({ projectRoot })}`);
  return 0;
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const primary = String(command[0] || 'help').toLowerCase();
  const projectRootHint = flags['project-root'] ? path.resolve(String(flags['project-root'])) : process.cwd();

  if (primary === 'core-path') {
    console.log(resolveCoreRoot({ projectRoot: projectRootHint }));
    return 0;
  }

  if (['help', '--help', '-h'].includes(primary)) {
    let coreRoot = '(not resolved)';
    try {
      coreRoot = resolveCoreRoot({ projectRoot: projectRootHint });
    } catch {
      // keep placeholder
    }
    printHelp(coreRoot);
    return 0;
  }

  const { api, cli } = await importCore({ projectRoot: projectRootHint });

  if (primary === 'version' || primary === '--version' || primary === '-v') {
    return cli.main(['version']);
  }
  if (primary === 'list-rules') return cli.main(['list-rules']);
  if (primary === 'explain') return cli.main(['explain', ...command.slice(1)]);

  if (primary === 'init') {
    if (flags['site-profile'] || flags.profile || flags['project-root']) {
      return initWithToolkit(flags);
    }
    const args = ['init', ...command.slice(1)];
    if (flags.force) args.push('--force');
    if (flags.cwd) args.push('--cwd', String(flags.cwd));
    return cli.main(args);
  }

  if (primary === 'validate-config') {
    if (flags['site-profile'] || flags.profile || flags['project-root'] || flags.config) {
      return validateWithToolkit(flags, api);
    }
    return cli.main(['validate-config']);
  }

  if (primary === 'run') {
    if (flags['site-profile'] || flags.profile || flags['project-root'] || flags['from-profile'] || flags.config) {
      return runWithToolkit(flags, api);
    }
    const args = ['run'];
    if (flags.config) args.push('--config', String(flags.config));
    if (flags.cwd) args.push('--cwd', String(flags.cwd));
    if (flags.quiet) args.push('--quiet');
    if (flags['no-color']) args.push('--no-color');
    return cli.main(args);
  }

  console.error(`Unknown command: ${primary}`);
  printHelp(resolveCoreRoot({ projectRoot: projectRootHint }));
  return 2;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error('\n[wcag-auditor bridge] failed');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
