#!/usr/bin/env node
// ./Web_Toolkit/pagespeed_diagnostics/bin/pagespeed-diagnostics.mjs
/**
 * CLI entrypoint for pagespeed-diagnostics.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runAgentBatch } from '../src/commands/agent-batch.mjs';
import { runAgentDiff } from '../src/commands/agent-diff.mjs';
import { runPageSpeed } from '../src/commands/run.mjs';
import { runRawPageSpeed } from '../src/commands/raw-psi.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'pagespeed-diagnostics',
    summary: 'Google PageSpeed Insights API diagnostics',
    usage: [
      'pagespeed-diagnostics run --site-profile <profile> [--strategy mobile|desktop|both]',
      'pagespeed-diagnostics raw-psi --site-profile <profile> [--strategy mobile|desktop]',
      'pagespeed-diagnostics agent-batch --site-profile <profile> [--routes core|root|csv] [--strategy mobile|desktop|both]',
      'pagespeed-diagnostics agent-diff --site-profile <profile> [--before <report>] [--after <report>]'
    ],
    commands: [
      { name: 'run', description: 'Query the Google PageSpeed Insights API for summarized performance diagnostics (Markdown).' },
      { name: 'raw-psi', description: 'Fetch the entire raw PageSpeed API JSON and save it for deep auditing.' },
      { name: 'agent-batch', description: 'AI-agent JSON-only batch runner. Raw PSI goes to files; stdout is compact problem-only JSON.' },
      { name: 'agent-diff', description: 'AI-agent JSON-only regression diff between two agent-batch reports.' }
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Portable site profile JSON for the target site.' },
      { name: '--project-root <path>', description: 'Override the project root from the site profile.' },
      { name: '--url <url>', description: 'Override the tested production URL.' },
      { name: '--strategy <mobile|desktop|both>', description: 'Choose one or both PageSpeed strategies.' },
      { name: '--api-key <key>', description: 'Optional explicit Google PageSpeed API key.' },
      { name: '--routes <core|root|csv>', description: 'Agent batch route selection. `core` uses profile diagnostics routes.' },
      { name: '--urls <csv>', description: 'Agent batch absolute URL override.' },
      { name: '--canonicalize <true|false>', description: 'Agent batch follows same-origin HEAD redirects before PSI. Defaults true.' }
    ],
    examples: [
      'pagespeed-diagnostics run --site-profile ../site-profiles/example-workers.json',
      'pagespeed-diagnostics raw-psi --site-profile ../site-profiles/example-workers.json --strategy mobile'
    ],
    notes: [
      'The tool prefers GOOGLE_PAGESPEED_API_KEY or PAGESPEED_API_KEY from the project root .env when present.',
      'Google API quota limits can still apply if no key is configured.'
    ],
    exitCodes: [
      { name: '0', description: 'All requested strategies returned results.' },
      { name: '2', description: 'One or more strategies failed or were quota-limited.' },
      { name: '1', description: 'Unhandled failure.' }
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
  if (primary === 'agent-batch') return runAgentBatch(flags);
  if (primary === 'agent-diff') return runAgentDiff(flags);
  if (primary === 'run') return runPageSpeed(flags);
  if (primary === 'raw-psi') return runRawPageSpeed(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[pagespeed-diagnostics] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

