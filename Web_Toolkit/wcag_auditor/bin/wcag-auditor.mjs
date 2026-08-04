#!/usr/bin/env node
// ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs
/**
 * Portable Web Toolkit WCAG Auditor CLI.
 *
 * When linked inside Web_Toolkit (shared helpers present): site-profile / Astro aware.
 * When invoked as a standalone package install: delegates to the bundled core CLI.
 * Never resolves AI/ or other trees outside this module / linked toolkit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_HELP = path.resolve(MODULE_ROOT, '../shared/lib/help.mjs');
const SHARED_CONTEXT = path.resolve(MODULE_ROOT, '../shared/lib/context.mjs');
const HAS_TOOLKIT_SHARED = fs.existsSync(SHARED_HELP) && fs.existsSync(SHARED_CONTEXT);

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

async function runCoreCli(argv) {
  const cli = await import(pathToFileURL(path.join(MODULE_ROOT, 'src', 'cli.mjs')).href);
  return cli.main(argv);
}

async function runToolkitMode(argv) {
  const { printHelp: printStandardHelp } = await import(pathToFileURL(SHARED_HELP).href);
  const {
    buildAstroConfigObject,
    writeAstroStarterFiles,
    writeEphemeralConfig
  } = await import('../src/toolkit/profile-config.mjs');
  const {
    importCore,
    outputPaths,
    resolveConfigPath,
    resolveCoreRoot,
    resolveProfile,
    resolveProjectRoot
  } = await import('../src/toolkit/paths.mjs');

  function printHelp(coreRoot = '') {
    return printStandardHelp({
      name: 'wcag-auditor',
      summary: 'Accessibility evidence gate bundled in Web_Toolkit (site-profile aware)',
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
        { name: 'run', description: 'Run the bundled auditor against a toolkit-managed site.' },
        { name: 'init', description: 'Write Astro/site-profile-aware starter config + manual evidence template.' },
        { name: 'validate-config', description: 'Load and validate the accessibility configuration.' },
        { name: 'list-rules', description: 'List built-in rule metadata.' },
        { name: 'explain', description: 'Print one built-in rule definition as JSON.' },
        { name: 'core-path', description: 'Print this bundled module root (must be under Web_Toolkit/).' }
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
        'Engine is self-contained in Web_Toolkit/wcag_auditor (no AI/ resolution).',
        coreRoot ? `Bundled core: ${coreRoot}` : 'Run `wcag-auditor core-path` to confirm the toolkit module path.',
        'Evidence gate only — does not certify WCAG conformance.'
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

    console.log(`[wcag-auditor] core → ${resolveCoreRoot()}`);
    console.log(`[wcag-auditor] reports → ${config.outputDirectory}`);
    console.log(`[wcag-auditor] gate exit → ${run.gate.exitCode} (${run.gate.status})`);
    return run.gate.exitCode;
  }

  async function initWithToolkit(flags) {
    let profile = {};
    let projectRoot = flags['project-root'] ? path.resolve(String(flags['project-root'])) : '';

    if (flags['site-profile'] || flags.profile) {
      const { resolvePortableRoot, resolveSiteProfilePath } = await import(pathToFileURL(SHARED_CONTEXT).href);
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
    console.log(`[wcag-auditor] core → ${resolveCoreRoot()}`);
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
    console.log(`Core: ${resolveCoreRoot()}`);
    return 0;
  }

  const { command, flags } = parseArgs(argv);
  const primary = String(command[0] || 'help').toLowerCase();

  if (primary === 'core-path') {
    console.log(resolveCoreRoot());
    return 0;
  }

  if (['help', '--help', '-h'].includes(primary)) {
    let coreRoot = '(not resolved)';
    try {
      coreRoot = resolveCoreRoot();
    } catch {
      // keep placeholder
    }
    printHelp(coreRoot);
    return 0;
  }

  const { api, cli } = await importCore();

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
    return cli.main(['validate-config', ...Object.entries(flags).flatMap(([k, v]) => (
      v === true ? [`--${k}`] : [`--${k}`, String(v)]
    ))]);
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
  printHelp(resolveCoreRoot());
  return 2;
}

async function main() {
  const argv = process.argv.slice(2);
  if (!HAS_TOOLKIT_SHARED) {
    return runCoreCli(argv);
  }
  return runToolkitMode(argv);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error('\n[wcag-auditor] failed');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
