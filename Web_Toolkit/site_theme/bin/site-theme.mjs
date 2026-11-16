#!/usr/bin/env node
// ./Web_Toolkit/site_theme/bin/site-theme.mjs
/**
 * CLI entrypoint for site-theme: install, validate, extract, and compare token-based site themes.
 */

import { parseCliArgs } from '../../shared/lib/cli.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { runApply, runExport, runList, runValidate } from '../src/commands/themes.mjs';
import { runCompare, runExtract, runMapInit } from '../src/commands/browser.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'site-theme',
    summary: 'Token-based themes for Astro sites: install bundled themes, extract a draft theme from a built site, compare several themes on the same site.',
    usage: [
      'site-theme list [--project-root <path>] [--source <dir>]',
      'site-theme validate <name|folder>... [--project-root <path>]',
      'site-theme apply <name>... | --all [--default <name>] [--pair <light>,<dark>] [--project-root <path>] [--force]',
      'site-theme export <name|folder> [--as <name>] [--label <text>] [--force]',
      'site-theme map init --url <base> [--routes /] [--project-root <path>] [--force]',
      'site-theme extract --url <base> [--routes /,/about/] [--name <name>] [--scheme light|dark] [--project-root <path>]',
      'site-theme compare --url <base> --themes a,b,c | --all [--routes /] [--map <file>] [--project-root <path>]'
    ],
    commands: [
      { name: 'list', description: 'Show available themes (toolkit starters, project src/styles/themes, output/site-theme) and whether each passes the AA contrast contract.' },
      { name: 'validate', description: 'Check a theme against the token contract: every token present, all text/background pairs meet WCAG AA.' },
      { name: 'apply', description: 'Install themes into a project: tokens under src/styles/themes, an import index, src/data/themes.json, and the ThemeToggle/ThemePicker components.' },
      { name: 'export', description: 'Copy a theme into your library (~/.portable-web-toolkit/themes, override with PORTABLE_TOOLKIT_THEMES) under any name, so any site can list/apply/compare it.' },
      { name: 'map', description: 'map init: scan a running site and write src/styles/themes/theme-map.json, the link between that site\'s own variable names and the theme contract (matched by resolved value, then name). apply turns it into compat.css.' },
      { name: 'extract', description: 'Measure a rendered page (colors, fonts, radii) and write a draft theme with a provenance note per token; contrast-critical pairs are repaired.' },
      { name: 'compare', description: 'Inject each theme into the live page, screenshot every route, count low-contrast text, and write a contact sheet (index.html).' }
    ],
    flags: [
      { name: '--project-root <path>', description: 'Project root (where playwright is installed and output/ is written). Defaults to the current directory.' },
      { name: '--url <base>', description: 'Base URL of a running preview or deployed site (extract/compare).' },
      { name: '--routes <csv>', description: 'Routes to measure or screenshot. Defaults to /.' },
      { name: '--themes <csv> / --all', description: 'Themes to compare.' },
      { name: '--map <file>', description: 'compare/apply: theme-map.json linking the contract to the site\'s own custom properties (default: src/styles/themes/theme-map.json when present; extract and map init write one).' },
      { name: '--source <dir>', description: 'Extra folder of themes to search. Repeatable.' },
      { name: '--default <name> / --pair <light>,<dark>', description: 'apply: the default theme and the light/dark pair the toggle switches between.' },
      { name: '--allow-contrast-failures', description: 'apply: install a theme even if it fails the AA contract.' },
      { name: '--force', description: 'apply: overwrite existing ThemeToggle/ThemePicker/theme-init files.' },
      { name: '--out <dir> / --name <name> / --label <text>', description: 'Output folder and naming for extract and compare.' },
      { name: '--full-page', description: 'compare: capture the whole page, not the first viewport.' }
    ],
    examples: [
      'site-theme list',
      'site-theme apply paper ink --pair paper,ink --project-root .',
      'site-theme extract --url http://127.0.0.1:4321 --routes /,/about/ --name my-site',
      'site-theme compare --url http://127.0.0.1:4321 --themes paper,ink,studio,glass-night,contrast --routes /',
      'site-theme validate output/site-theme/my-site'
    ],
    notes: [
      'A theme is a folder: theme.json and tokens.css declaring every token in templates/theme/tokens.contract.json under :root[data-theme="<name>"].',
      'Component CSS must read var(--color-*), var(--font-*), var(--space-*), var(--radius-*); brand palette names stay inside a theme. That is what makes a theme swappable.',
      'Extracted themes are drafts: tokens are marked measured, derived, repaired, or defaulted in theme.json. Review before applying.',
      'compare and extract need playwright in the project and a running preview (production build recommended).',
      'Sharing a design: extract it from a site, export it under a name (for example nomos), then apply or compare it on another site. A site whose variable names differ needs one theme-map.json (map init); components that hardcode colors stay unthemed, and compare counts them.',
      'Astro has no built-in theme runtime: this is plain CSS custom properties plus a data-theme attribute, so it works with any Astro version.'
    ],
    exitCodes: [
      { name: '0', description: 'Completed.' },
      { name: '2', description: 'A theme failed validation (or an extracted draft failed the contract).' },
      { name: '1', description: 'Unhandled failure, unknown theme, or missing runtime.' }
    ]
  });
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2), { booleanFlags: ['all', 'force', 'full-page', 'allow-contrast-failures'] });
  const primary = String(command[0] || 'help').toLowerCase();
  const log = (text) => process.stdout.write(text);
  if (['help', '--help', '-h'].includes(primary) || flags.help) { printHelp(); return 0; }
  if (primary === 'list') return runList(flags, log);
  if (primary === 'validate') return runValidate(command.slice(1), flags, log);
  if (primary === 'apply') return runApply(command.slice(1), flags, log);
  if (primary === 'export') return runExport(command.slice(1), flags, log);
  if (primary === 'map') { if (command[1] !== 'init') throw new Error('usage: site-theme map init --url <base>'); return runMapInit(flags, log); }
  if (primary === 'extract') return runExtract(flags, log);
  if (primary === 'compare') return runCompare(flags, log);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('[site-theme]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
