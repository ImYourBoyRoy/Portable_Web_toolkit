#!/usr/bin/env node
// ./Web_Toolkit/form_doctor/bin/form-doctor.mjs
/**
 * CLI entrypoint for form-doctor: static scan and local runtime probe for contact and intake forms.
 *
 * Run `node ./bin/form-doctor.mjs scan --project-root <path>` for the read-only source scan, or
 * `... run --project-root <path> --spawn` after a build to also probe a local Worker with a broken mail binding.
 */

import path from 'node:path';
import fs from 'node:fs';
import { parseCliArgs } from '../../shared/lib/cli.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { scanProject } from '../src/scan.mjs';
import { runProbes, withBrokenMailWorker } from '../src/probe.mjs';
import { exitCodeFor, renderProbe, renderScan, writeJson } from '../src/report.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'form-doctor',
    summary: 'Check that contact and intake forms report failures honestly (static scan plus local runtime probe)',
    usage: [
      'form-doctor scan --project-root <path> [--json] [--json-out <path>] [--strict]',
      'form-doctor probe --project-root <path> (--spawn | --base-url http://127.0.0.1:<port> --expect-mail-failure) [--endpoint /api/x] [--form-page /contact/]',
      'form-doctor run --project-root <path> [--spawn] [--json-out <path>]'
    ],
    commands: [
      { name: 'scan', description: 'Read-only source scan: forms without method, swallowed send errors, payload logging, err.message leaks, no body cap, no allowlist, unescaped HTML email. INFO when the project has no form.' },
      { name: 'probe', description: 'Runtime probe of a LOCAL Worker: GET carries no data, 1.5 MB gets 413, unknown field gets 400/422, broken mail binding gets non-2xx, answers leak nothing.' },
      { name: 'run', description: 'scan, then probe when --spawn or --base-url is given.' }
    ],
    flags: [
      { name: '--project-root <path>', description: 'Project to check. Defaults to the current directory.' },
      { name: '--spawn', description: 'Start wrangler dev on a temporary copy of the built config (dist/server/wrangler.json) twice: mail binding removed (expect 503) and destination rejected (expect 502). Needs a build.' },
      { name: '--wrangler-config <path>', description: 'Built Worker config for --spawn. Default dist/server/wrangler.json.' },
      { name: '--base-url <url>', description: 'An already running LOCAL server (loopback only; any other host is refused).' },
      { name: '--expect-mail-failure', description: 'With --base-url: you vouch that the server has a broken mail binding, so the valid-payload probe expects a 5xx.' },
      { name: '--endpoint <path>', description: 'Form endpoint. Detected from the form action when omitted.' },
      { name: '--form-page <path>', description: 'Route that serves the form. Detected from the page file when omitted.' },
      { name: '--strict', description: 'Treat warnings as failures.' },
      { name: '--json', description: 'Emit the report as JSON on stdout.' },
      { name: '--json-out <path>', description: 'Also write the JSON report to a file.' }
    ],
    examples: [
      'form-doctor scan --project-root .',
      'form-doctor run --project-root . --spawn --json-out ./output/form-doctor.json',
      'form-doctor probe --project-root . --base-url http://127.0.0.1:8787 --expect-mail-failure'
    ],
    notes: [
      'Read-only on source. --spawn writes and removes one temporary config next to the built Worker config and stops its dev server; probes send synthetic data only and never to a non-loopback host.',
      'Opt-outs on a <form>: data-form-doctor="ignore", "client-only" (JS-only, no server round trip) or "get-ok". Search forms (role="search") are never flagged.',
      'Fails closed: an unreadable or unparsable surface is a FAIL (malformed-surface), not a skip.'
    ],
    exitCodes: [
      { name: '0', description: 'No failures (warnings allowed unless --strict).' },
      { name: '2', description: 'One or more failures.' },
      { name: '1', description: 'Unhandled failure or bad arguments.' }
    ]
  });
}

function pageRoute(file) {
  const m = file.replace(/\\/g, '/').match(/src\/pages\/(.+?)\.(?:astro|html|md|mdx|tsx|jsx)$/);
  if (!m) return null;
  const route = m[1] === 'index' ? '' : m[1].replace(/\/index$/, '');
  return route ? `/${route}/` : '/';
}

/** Page-file routes that render a component (directly, or through one wrapping component), so a form that lives in a component can still be probed. */
function routesUsing(projectRoot, componentFile) {
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(astro|mdx|tsx|jsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(projectRoot, 'src'));
  const stem = (file) => path.basename(file).replace(/\.[^.]+$/, '');
  const importers = (name) => files.filter((file) => new RegExp(`import\\s+[^;]*\\b${name}\\b[^;]*from\\s+['"][^'"]*${name}(?:\\.\\w+)?['"]`).test(fs.readFileSync(file, 'utf8')));
  const rel = (file) => path.relative(projectRoot, file).replace(/\\/g, '/');
  const direct = importers(stem(componentFile));
  const wrapped = direct.flatMap((file) => (pageRoute(rel(file)) ? [] : importers(stem(file))));
  return [...direct, ...wrapped].map((file) => pageRoute(rel(file))).filter(Boolean);
}

function detectTargets(scan, flags, projectRoot) {
  const posting = scan.forms.find((f) => f.method === 'post' && f.action && f.action.startsWith('/')) ?? scan.forms.find((f) => f.method === 'post');
  // Source actions such as {CONFIG.endpoint} are expressions; the probe reads the real action from the served page.
  const sourceAction = posting?.action && posting.action.startsWith('/') ? posting.action : null;
  return {
    endpoint: typeof flags.endpoint === 'string' ? flags.endpoint : sourceAction,
    formPage: typeof flags['form-page'] === 'string' ? flags['form-page'] : posting ? (pageRoute(posting.file) ?? routesUsing(projectRoot, posting.file)[0] ?? null) : null
  };
}

async function probeCommand(scan, flags, projectRoot) {
  const { endpoint, formPage } = detectTargets(scan, flags, projectRoot);
  if (!formPage) {
    return { probes: [{ id: 'targets', status: 'info', detail: 'No page that renders a POST form was found; pass --form-page (and --endpoint) to probe a specific route.' }], label: 'no target' };
  }
  const probes = [];
  if (flags.spawn) {
    const config = typeof flags['wrangler-config'] === 'string' ? flags['wrangler-config'] : 'dist/server/wrangler.json';
    if (!fs.existsSync(path.resolve(projectRoot, config))) {
      return { probes: [{ id: 'spawn', status: 'fail', detail: `Built Worker config not found at ${config}. Run the site build first.` }], label: 'spawn' };
    }
    for (const mode of ['missing', 'rejected']) {
      try {
        const { results } = await withBrokenMailWorker({ projectRoot, wranglerConfig: config, mode, fn: (baseUrl) => runProbes({ baseUrl, endpoint, formPage, mail: mode }) });
        // Structural probes are identical across modes; report them once.
        probes.push(...results.filter((r) => mode === 'missing' || r.id.startsWith('mail-')));
      } catch (error) {
        probes.push({ id: `spawn-${mode}`, status: 'fail', detail: error instanceof Error ? error.message : String(error) });
      }
    }
    return { probes, label: `spawned Worker (${endpoint ?? 'action from page'} on ${formPage})` };
  }
  if (typeof flags['base-url'] === 'string') {
    const { results } = await runProbes({ baseUrl: flags['base-url'], endpoint, formPage, mail: 'unknown', expectMailFailure: flags['expect-mail-failure'] === true });
    return { probes: results, label: `${flags['base-url']} (${endpoint ?? 'action from page'} on ${formPage})` };
  }
  throw new Error('probe needs --spawn or --base-url.');
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2), { booleanFlags: ['spawn', 'expect-mail-failure', 'strict'] });
  const primary = String(command[0] || 'help').toLowerCase();
  if (['help', '--help', '-h'].includes(primary) || flags.help) {
    printHelp();
    return 0;
  }
  if (!['scan', 'probe', 'run'].includes(primary)) {
    console.error(`Unknown command: ${primary}`);
    printHelp();
    return 1;
  }
  const projectRoot = path.resolve(typeof flags['project-root'] === 'string' ? flags['project-root'] : process.cwd());
  const strict = flags.strict === true;
  const report = { tool: 'form-doctor', projectRoot, command: primary, findings: [], probes: [] };

  const scan = scanProject(projectRoot);
  if (primary === 'scan' || primary === 'run' || primary === 'probe') report.findings = primary === 'probe' ? [] : scan.findings;
  report.forms = scan.forms;
  report.handlers = scan.handlers;

  let probeLabel = '';
  if (primary === 'probe' || (primary === 'run' && (flags.spawn || flags['base-url']))) {
    const outcome = await probeCommand(scan, flags, projectRoot);
    report.probes = outcome.probes;
    probeLabel = outcome.label;
  }

  if (flags.json === true) console.log(JSON.stringify(report, null, 2));
  else {
    if (primary !== 'probe') console.log(renderScan({ ...scan, findings: report.findings }));
    if (report.probes.length > 0 || primary === 'probe') console.log(renderProbe(report.probes, probeLabel));
    if (primary === 'run' && report.probes.length === 0) console.log('  Runtime probe: not run (add --spawn after a build, or --base-url for a local server).');
  }
  if (typeof flags['json-out'] === 'string') writeJson(report, flags['json-out']);
  return exitCodeFor(report, strict);
}

main().then((code) => process.exit(typeof code === 'number' ? code : 1)).catch((error) => {
  console.error('\n[form-doctor] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
