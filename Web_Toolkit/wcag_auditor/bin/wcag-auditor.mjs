#!/usr/bin/env node
// ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs
/**
 * Portable Web Toolkit WCAG Auditor CLI.
 *
 * Site-profile / Astro wrapper around WCAGate (`@imyourboyroy/wcagate`).
 * Never resolves AI/ sibling checkouts. Missing engine: npm install in Web_Toolkit/.
 */

import { parseCliArgs as sharedParseCliArgs } from '../../shared/lib/cli.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findLatestRunFile } from '../src/toolkit/latest-run.mjs';
import { DEFAULT_BASELINE_FILE, applyOverlays, detectEngineFeatures, engineCliArgs, finishOverlays } from '../src/toolkit/overlays.mjs';

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

function parseArgs(argv = []) {
  // --sitemap takes its value only as --sitemap=<url|file>, so `wcag-auditor --sitemap run` keeps `run` as the command.
  const { command, flags } = sharedParseCliArgs(argv, { booleanFlags: ['sitemap'] });
  return { command, flags };
}

function engineOptions(flags = {}) {
  return {
    skip: toBool(flags['skip-engine-install'], false),
    update: toBool(flags['update-engine'], false)
  };
}

function findReportFile(run, config, names) {
  const reportFiles = run.reportFiles || [];
  const candidates = [];
  for (const name of names) {
    const match = reportFiles.find((file) => String(file).replace(/\\/g, '/').endsWith(name));
    if (match) {
      candidates.push(path.isAbsolute(match) ? match : path.resolve(run.project.root, match));
    }
    candidates.push(path.join(config.outputDirectory, name));
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0] || null;
}

async function runCoreCli(argv, flags = {}) {
  const { importCore } = await import('../src/toolkit/resolve-core.mjs');
  const { cli } = await importCore(engineOptions(flags));
  return cli.main(argv);
}

async function runToolkitMode(argv) {
  const { printHelp: printStandardHelp } = await import(pathToFileURL(SHARED_HELP).href);
  const {
    buildAstroConfigObject,
    resolveManagedServerPort,
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
      summary: 'Accessibility evidence gate: site-profile wrapper around WCAGate',
      usage: [
        'wcag-auditor run --site-profile <profile> [--project-root <path>] [--from-profile] [--manage-server]',
        'wcag-auditor run --project-root <path> [--config <file>]',
        'wcag-auditor init --site-profile <profile> [--force]',
        'wcag-auditor report [--site-profile <profile>] [--group g3] [--json] [--file <run.json>]',
        'wcag-auditor doctor [--site-profile <profile>]',
        'wcag-auditor validate-config --site-profile <profile>',
        'wcag-auditor list-rules',
        'wcag-auditor explain <rule-id>',
        'wcag-auditor core-path'
      ],
      commands: [
        { name: 'run', description: 'Run WCAGate against a toolkit-managed site.' },
        { name: 'init', description: 'Write Astro/site-profile-aware starter config + manual evidence template.' },
        { name: 'report', description: 'Re-print the grouped, token-lean report of the newest run; --group gN drills into one cause (WCAGate with the agent report).' },
        { name: 'doctor', description: 'Diagnose engine, Node, and Playwright readiness (fail closed).' },
        { name: 'validate-config', description: 'Load and validate the accessibility configuration.' },
        { name: 'list-rules', description: 'List built-in rule metadata.' },
        { name: 'explain', description: 'Print one built-in rule definition as JSON.' },
        { name: 'core-path', description: 'Print the resolved WCAGate engine root (under Web_Toolkit/node_modules).' }
      ],
      flags: [
        { name: '--site-profile <path>', description: 'Portable site profile JSON for the target site.' },
        { name: '--project-root <path>', description: 'Override the project root from the site profile.' },
        { name: '--config <file>', description: 'Explicit wcag-auditor / wcagate config path (relative to project root).' },
        { name: '--from-profile', description: 'Build an ephemeral config from site-profile routes/hosts.' },
        { name: '--manage-server', description: 'Start profile commands.preview for profile-built configs.' },
        { name: '--base-url <url>', description: 'Override adapter baseURL (local preview or live URL).' },
        { name: '--routes </a,/b>', description: 'Audit exactly these routes instead of the configured ones.' },
        { name: '--sitemap[=<url|file>]', description: 'Audit the routes listed in sitemap.xml (default: <base-url>/sitemap.xml). Needs WCAGate 2.4+.' },
        { name: '--max-routes <n>', description: 'Cap routes taken from the sitemap (default 50).' },
        { name: '--color-schemes <light,dark>', description: 'Run every route in each color scheme. Needs WCAGate 2.4+.' },
        { name: '--viewports <mobile,tablet,desktop>', description: 'Run every route at each viewport preset. Needs WCAGate 2.4+.' },
        { name: '--baseline [file]', description: `Only findings absent from the baseline block the gate (default ${DEFAULT_BASELINE_FILE}).` },
        { name: '--write-baseline [file]', description: 'Record current findings as the known baseline after the run.' },
        { name: '--skip-playwright-install', description: 'Do not auto-install Playwright peers/Chromium when missing.' },
        { name: '--skip-engine-install', description: 'Do not auto-npm-install WCAGate when missing (exit 2 instead).' },
        { name: '--update-engine', description: 'Reinstall github:imyourboyroy/WCAGate in Web_Toolkit/ (no toolkit VERSION bump).' },
        { name: '--force', description: 'Overwrite starter files during init.' },
        { name: '--verbose', description: 'Print the per-finding console listing instead of the grouped agent view.' },
        { name: '--no-compare', description: 'Skip the comparison with the previous run (since-last-run counts, NEW markers).' },
        { name: '--group <id>', description: 'With report: full members of one cause (ids come from the report).' },
        { name: '--quiet', description: 'Reduce console reporter noise.' },
        { name: '--no-color', description: 'Disable ANSI color in console output.' }
      ],
      examples: [
        'wcag-auditor init --site-profile ../site-profiles/example-workers.json',
        'wcag-auditor doctor --site-profile ../site-profiles/example-workers.json',
        'wcag-auditor run --site-profile ../site-profiles/example-workers.json --base-url http://127.0.0.1:4321',
        'wcag-auditor run --site-profile ../site-profiles/example-workers.json --from-profile',
        'wcag-auditor run --site-profile ../site-profiles/example-workers.json --base-url http://127.0.0.1:4321 --sitemap --color-schemes light,dark --viewports mobile,desktop',
        'wcag-auditor run --project-root . --base-url http://127.0.0.1:4321 --write-baseline   # adopt on a legacy site',
        'wcag-auditor run --project-root . --base-url http://127.0.0.1:4321 --baseline          # only new findings block',
        'wcag-auditor core-path'
      ],
      notes: [
        'Engine is github:imyourboyroy/WCAGate, installed into Web_Toolkit/node_modules.',
        'If the engine is missing: cd Web_Toolkit && npm install --allow-git=all',
        'Prefer a checked-in wcag-auditor.config.mjs or wcagate.config.mjs; with --site-profile and no config, --from-profile is implied.',
        'Playwright peers install in the client project; Chromium is auto-installed unless --skip-playwright-install.',
        'After run, tell the user the gate (0/1/2/3) and findings with file:line. Optional HTML: results.html (serve) — not a GUI.',
        'Never resolve AI/wcag-auditor. core-path should contain node_modules/@imyourboyroy/wcagate.',
        coreRoot ? `WCAGate engine: ${coreRoot}` : 'Run `wcag-auditor core-path` after npm install in Web_Toolkit/.',
        'Contrast on gradients, images, and glass is measured from rendered pixels (WCAGate 2.4+), so it fails or passes instead of staying unresolved.',
        'Evidence gate only — does not certify WCAG conformance.'
      ],
      exitCodes: [
        { name: '0', description: 'Configured gate passed.' },
        { name: '1', description: 'Blocking accessibility findings.' },
        { name: '2', description: 'Configuration, dependency, adapter, missing engine, or empty-surface failure.' },
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

    let useFromProfile = toBool(flags['from-profile'], false);
    let configPath = null;
    if (!useFromProfile) {
      configPath = await resolveConfigPath(projectRoot, flags, profile);
      if (!configPath && (flags['site-profile'] || flags.profile)) {
        useFromProfile = true;
        console.log('[wcag-auditor] no wcag-auditor.config.mjs / wcagate.config.mjs found; using --from-profile ephemeral config');
      }
    }

    if (useFromProfile) {
      fs.mkdirSync(paths.outputDir, { recursive: true });
      const managedServerPort = await resolveManagedServerPort({ profile, flags });
      if (managedServerPort?.busy) {
        console.log(`[wcag-auditor] port ${managedServerPort.preferred} is in use by another process (left untouched); the managed preview uses ${managedServerPort.port}`);
      }
      const configObject = buildAstroConfigObject({
        profile,
        projectRoot,
        outputDirectory: paths.outputDir,
        flags,
        includeManualEvidence: false,
        engineFeatures: detectEngineFeatures(api),
        managedServerPort
      });
      configPath = writeEphemeralConfig(paths.ephemeralConfigPath, configObject);
      console.log(`[wcag-auditor] ephemeral config → ${configPath}`);
    } else if (!configPath) {
      throw new Error(
        `No wcag-auditor.config.mjs or wcagate.config.mjs found under ${projectRoot}. Run \`wcag-auditor init --site-profile <profile>\` or pass --from-profile.`
      );
    }

    const { ensurePlaywrightReady } = await import('../src/toolkit/ensure-playwright.mjs');
    const playwrightReady = await ensurePlaywrightReady({
      projectRoot,
      browser: 'chromium',
      autoInstall: !toBool(flags['skip-playwright-install'], false)
    });
    if (!playwrightReady.ok) {
      for (const warning of playwrightReady.warnings) console.error(`[wcag-auditor] ${warning}`);
      throw new Error('Playwright is not ready for the WCAG auditor run.');
    }
    if (playwrightReady.actions.length > 0) {
      console.log(`[wcag-auditor] Playwright prep: ${playwrightReady.actions.join('; ')}`);
    }

    const config = await api.loadConfig(configPath, { cwd: projectRoot });
    if (flags['base-url'] && !useFromProfile) {
      // A checked-in config file has its own baseURL (often production). Honor --base-url for it too, and say so.
      const target = String(flags['base-url']).replace(/\/$/, '');
      let applied = 0;
      for (const adapter of config.adapters ?? []) {
        if (adapter && typeof adapter.baseURL === 'string') { adapter.baseURL = target; applied += 1; }
      }
      console.log(`[wcag-auditor] --base-url applied to ${applied} adapter(s): ${target}`);
    }
    if (useFromProfile || flags['site-profile'] || flags.profile) {
      config.outputDirectory = paths.outputDir;
      fs.mkdirSync(paths.outputDir, { recursive: true });
    }

    const overlayLog = (message) => console.log(`[wcag-auditor] ${message}`);
    const overlays = await applyOverlays({ api, config, flags, profile, projectRoot, log: overlayLog });

    // Each profile run writes to its own timestamped folder, so hand the engine the previous run explicitly.
    const features = detectEngineFeatures(api);
    const previousFile = features.agent && !toBool(flags['no-compare'], false)
      ? findLatestRunFile(projectRoot, siteId, { exclude: paths.outputDir })
      : null;
    const previous = previousFile ? await api.readPreviousRun(previousFile) : undefined;

    const run = await api.runAccessibility(config, {
      configIsNormalized: true,
      baseline: overlays.baseline,
      previous,
      consoleStyle: toBool(flags.verbose, false) ? 'verbose' : undefined,
      quiet: toBool(flags.quiet, false),
      color: flags['no-color'] ? false : undefined,
      stream: process.stdout
    });

    await finishOverlays({ api, run, overlays, projectRoot, log: overlayLog });
    console.log(`[wcag-auditor] engine → ${resolveCoreRoot(engineOptions(flags))}`);
    console.log(`[wcag-auditor] reports → ${config.outputDirectory}`);
    const resultsAbs = findReportFile(run, config, ['results.html', 'wcag-audit-dashboard.html']);
    if (resultsAbs) {
      console.log(`[wcag-auditor] results HTML (optional view; share path, do not open as text) → ${resultsAbs}`);
    }
    console.log(`[wcag-auditor] gate exit → ${run.gate.exitCode} (${run.gate.reason})`);
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
    console.log(`[wcag-auditor] engine → ${resolveCoreRoot(engineOptions(flags))}`);
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
    console.log(`Engine: ${resolveCoreRoot(engineOptions(flags))}`);
    return 0;
  }

  const { command, flags } = parseArgs(argv);
  const primary = String(command[0] || 'help').toLowerCase();
  const opts = engineOptions(flags);

  if (primary === 'core-path') {
    console.log(resolveCoreRoot(opts));
    return 0;
  }

  if (['help', '--help', '-h'].includes(primary)) {
    let coreRoot = '(engine not resolved)';
    try {
      coreRoot = resolveCoreRoot({ ...opts, skip: true });
    } catch {
      try {
        coreRoot = resolveCoreRoot(opts);
      } catch {
        // keep placeholder
      }
    }
    printHelp(coreRoot);
    return 0;
  }

  const { api, cli } = await importCore(opts);

  if (primary === 'version' || primary === '--version' || primary === '-v') {
    return cli.main(['version']);
  }
  if (primary === 'list-rules') return cli.main(['list-rules']);
  if (primary === 'explain') return cli.main(['explain', ...command.slice(1)]);

  if (primary === 'doctor') {
    const resolved = resolveProfile(flags);
    const projectRoot = resolveProjectRoot(flags, resolved);
    const doctorArgs = ['doctor', '--cwd', projectRoot];
    if (flags.json) doctorArgs.push('--json');
    if (flags.config) doctorArgs.push('--config', String(flags.config));
    return cli.main(doctorArgs);
  }

  if (primary === 'report') {
    if (!detectEngineFeatures(api).agent) {
      throw new Error(`report needs WCAGate with the agent report; the installed engine is ${api?.TOOLKIT_VERSION ?? 'unknown'}. Run \`wcag-auditor run --update-engine\` (or tag and publish WCAGate) and retry.`);
    }
    const resolved = resolveProfile(flags);
    const projectRoot = resolveProjectRoot(flags, resolved);
    const siteId = resolved?.profile?.siteId || path.basename(projectRoot);
    const file = flags.file ? path.resolve(String(flags.file)) : findLatestRunFile(projectRoot, siteId);
    if (!file) throw new Error(`No previous run found under ${path.join(projectRoot, 'output')}. Run \`wcag-auditor run\` first or pass --file.`);
    const reportArgs = ['report', '--file', file];
    for (const name of ['group', 'max-groups', 'max-elements']) if (flags[name] !== undefined && flags[name] !== true) reportArgs.push(`--${name}`, String(flags[name]));
    if (flags.json) reportArgs.push('--json');
    return cli.main(reportArgs);
  }

  if (primary === 'prepare') {
    const resolved = resolveProfile(flags);
    const projectRoot = resolveProjectRoot(flags, resolved);
    const prepareArgs = ['prepare', '--cwd', projectRoot];
    if (flags.config) prepareArgs.push('--config', String(flags.config));
    if (flags['skip-playwright-install']) prepareArgs.push('--skip-playwright-install');
    return cli.main(prepareArgs);
  }

  if (primary === 'init') {
    if (flags['site-profile'] || flags.profile || flags['project-root']) {
      return initWithToolkit(flags);
    }
    const args = ['init', ...command.slice(1)];
    if (flags.force) args.push('--force');
    if (flags.cwd) args.push('--cwd', String(flags.cwd));
    if (flags.preset) args.push('--preset', String(flags.preset));
    return cli.main(args);
  }

  if (primary === 'validate-config') {
    if (flags['site-profile'] || flags.profile || flags['project-root'] || flags.config) {
      return validateWithToolkit(flags, api);
    }
    return cli.main(['validate-config', '--cwd', String(flags.cwd || process.cwd())]);
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
    args.push(...engineCliArgs(flags));
    return cli.main(args);
  }

  console.error(`Unknown command: ${primary}`);
  printHelp(resolveCoreRoot(opts));
  return 2;
}

async function main() {
  const argv = process.argv.slice(2);
  const { flags } = parseArgs(argv);
  if (!HAS_TOOLKIT_SHARED) {
    return runCoreCli(argv, flags);
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
