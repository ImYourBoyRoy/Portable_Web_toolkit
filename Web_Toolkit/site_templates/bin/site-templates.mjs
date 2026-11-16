#!/usr/bin/env node
// ./Web_Toolkit/site_templates/bin/site-templates.mjs
/**
 * CLI entrypoint for site-templates: install template folders into a site in one command.
 */

import path from 'node:path';
import { parseCliArgs } from '../../shared/lib/cli.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { applyInstall, loadManifests, planInstall, renderPlan, renderShow } from '../src/index.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'site-templates',
    summary: 'Install copy-ready site templates (layout, analytics, contact, contact-intake, theme, styles, fonts) into a project with their prerequisites, CSS imports, and next steps.',
    usage: ['site-templates list', 'site-templates show <name> [--section <words>]', 'site-templates add <name>... [--project-root <path>] [--apply] [--force] [--verbose]'],
    commands: [
      { name: 'list', description: 'Show available templates, what each needs, and what it installs.' },
      { name: 'show', description: 'One template in ~150 tokens: what it installs, needs, env and next steps, plus its README section outline. --section <words> prints just that README section (props, data files, ...) instead of the whole README.' },
      { name: 'add', description: 'Plan (dry-run) or --apply the install of one or more templates plus their prerequisites, in order.' }
    ],
    flags: [
      { name: '--project-root <path>', description: 'The site to install into. Defaults to the current directory.' },
      { name: '--apply', description: 'Copy the files and append CSS imports to src/styles/global.css. Without it nothing is written.' },
      { name: '--section <words>', description: 'show: print only the README section whose heading contains these words.' },
      { name: '--verbose', description: 'add: list every file instead of one line per folder.' },
      { name: '--force', description: 'Overwrite files that exist with different content (and replace example data files).' }
    ],
    examples: ['site-templates list', 'site-templates show layout --section props', 'site-templates add layout analytics contact --project-root .', 'site-templates add layout analytics contact --project-root . --apply'],
    notes: [
      'Never overwrites a file whose content differs unless --force; data/config examples (site.json, nav.json, analytics.json...) are kept once they exist.',
      'Destinations must stay inside the project. Manual prerequisites (the discovery template) are reported, not guessed.',
      'Edit the copied data files, wire the components as printed under "next", then run the build and the quality gates.'
    ],
    exitCodes: [{ name: '0', description: 'Planned or installed (a differing file was skipped and reported).' }, { name: '2', description: 'Some files differ and were not overwritten.' }, { name: '1', description: 'Unknown template or other failure.' }]
  });
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const primary = String(command[0] || 'help').toLowerCase();
  if (['help', '--help', '-h'].includes(primary) || flags.help) { printHelp(); return 0; }
  const manifests = loadManifests();
  if (primary === 'list') {
    for (const manifest of [...manifests.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      process.stdout.write(`${manifest.name.padEnd(10)} ${manifest.requires?.length ? `needs ${manifest.requires.join(',')}` : ''}\n  ${manifest.description}\n`);
    }
    return 0;
  }
  if (primary === 'show') {
    const name = command[1];
    if (!name) throw new Error('show needs a template name; see `site-templates list`');
    const manifest = manifests.get(name);
    if (!manifest) throw new Error(`Unknown template "${name}". Available: ${[...manifests.keys()].sort().join(', ')}`);
    process.stdout.write(renderShow(manifest, { manifests, section: flags.section, projectRoot: path.resolve(flags['project-root'] || '.') }));
    return 0;
  }
  if (primary === 'add') {
    const names = command.slice(1);
    if (names.length === 0) throw new Error('add needs template names; see `site-templates list`');
    const projectRoot = path.resolve(flags['project-root'] || '.');
    const plan = planInstall(projectRoot, names, { manifests, force: flags.force === true });
    const apply = flags.apply === true;
    const result = apply ? applyInstall(projectRoot, plan) : undefined;
    process.stdout.write(renderPlan(plan, { apply, result, verbose: flags.verbose === true }));
    return plan.actions.some((action) => action.status === 'differs') ? 2 : 0;
  }
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => { console.error('[site-templates]', error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
