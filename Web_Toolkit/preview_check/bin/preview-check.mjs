#!/usr/bin/env node
// ./Web_Toolkit/preview_check/bin/preview-check.mjs
/**
 * CLI entrypoint for preview-check: pre-deploy checks against a local preview or any URL.
 */

import { parseCliArgs } from '../../shared/lib/cli.mjs';
import { runLighthouse } from '../src/commands/lighthouse.mjs';
import { runLayoutCheck } from '../src/commands/layout.mjs';
import { runMotionCheck } from '../src/commands/motion.mjs';
import { runContrast } from '../src/commands/contrast.mjs';
import { runSeo } from '../src/commands/seo.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'preview-check',
    summary: 'Pre-deploy checks (Lighthouse, responsive overflow, motion policy) against a local preview or any URL',
    usage: [
      'preview-check lighthouse --url <base> [--routes /,/about/] [--strategy mobile|desktop|both] [--min 90]',
      'preview-check layout --url <base> [--routes /,/about/] [--widths 375,768,1440]',
      'preview-check motion --url <base> [--routes /,/about/]',
      'preview-check seo --url <base> [--routes /,/about/ | --sitemap [url|file]] [--max-routes 60] [--canonical-host example.com] [--skip-links]',
      'preview-check contrast --url <base> [--routes /,/about/] [--schemes dark,light] [--width 1440] [--click <selector>]'
    ],
    commands: [
      { name: 'lighthouse', description: 'Run Lighthouse on a local or deployed URL. Compact JSON on stdout; raw reports in output/preview-check/.' },
      { name: 'layout', description: 'Detect horizontal overflow at phone, tablet and desktop widths and name the offending elements.' },
      { name: 'contrast', description: 'Resolve each text node against its real background in dark and light schemes and list WCAG AA failures. Catches what axe reports only as cantTell on translucent backgrounds.' },
      { name: 'seo', description: 'Deterministic on-page SEO audit of rendered pages: title/description (length, duplicates), canonical, noindex, lang, h1, Open Graph/Twitter, JSON-LD parse, image sizing, broken and redirecting internal links. One line per cause.' },
      { name: 'motion', description: 'Verify reduced-motion, above-the-fold opacity, mobile canvas and no-JS content rules for cinematic pages.' }
    ],
    flags: [
      { name: '--url <base>', description: 'Base URL, for example http://127.0.0.1:4321. Required.' },
      { name: '--routes <csv>', description: 'Routes to check. Defaults to /.' },
      { name: '--project-root <path>', description: 'Project root (where playwright is installed and output/ is written). Defaults to the current directory.' },
      { name: '--strategy <mobile|desktop|both>', description: 'Lighthouse preset. Defaults to both.' },
      { name: '--min <score>', description: 'Lighthouse pass threshold per category. Defaults to 90.' },
      { name: '--widths <csv>', description: 'Viewport widths for layout. Defaults to 375,768,1440.' },
      { name: '--schemes <csv>', description: 'Color schemes for contrast. Defaults to dark,light.' },
      { name: '--width <px>', description: 'Viewport width for contrast. Defaults to 1440.' },
      { name: '--click <selector>', description: 'Click this element before measuring contrast (for example a mobile menu button).' },
      { name: '--sitemap [url|file]', description: 'seo: take routes from sitemap.xml (production hosts are mapped onto --url).' },
      { name: '--canonical-host <host>', description: 'seo: canonical URLs must use this host (the production domain).' },
      { name: '--skip-links', description: 'seo: skip the internal link check.' },
      { name: '--allow-noindex', description: 'seo: do not report noindex pages (staging/dev previews).' },
      { name: '--settle-ms <ms>', description: 'Wait after load before measuring.' }
    ],
    examples: [
      'preview-check lighthouse --url http://127.0.0.1:8791 --routes /,/about/ --min 100',
      'preview-check layout --url http://127.0.0.1:8791 --routes /,/software/',
      'preview-check motion --url http://127.0.0.1:8791 --routes /'
    ],
    notes: [
      'Serve a production build first (for example `wrangler dev` on dist/server) so Lighthouse sees real bytes, not the dev server.',
      'layout and motion need playwright in the project (npm install -D playwright && npx playwright install chromium).',
      'The Lighthouse command runs through npx and a local Chrome; set CHROME_PATH if Chrome is not on the default path.'
    ],
    exitCodes: [
      { name: '0', description: 'All checks passed.' },
      { name: '2', description: 'A check failed (below threshold, overflow found, or a motion rule broke).' },
      { name: '1', description: 'Unhandled failure or missing runtime.' }
    ]
  });
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const primary = String(command[0] || 'help').toLowerCase();
  if (['help', '--help', '-h'].includes(primary)) {
    printHelp();
    return 0;
  }
  if (primary === 'lighthouse') return runLighthouse(flags);
  if (primary === 'layout') return runLayoutCheck(flags);
  if (primary === 'motion') return runMotionCheck(flags);
  if (primary === 'seo') return runSeo(flags);
  if (primary === 'contrast') return runContrast(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[preview-check] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
