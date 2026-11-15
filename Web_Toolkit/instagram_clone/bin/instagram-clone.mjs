#!/usr/bin/env node
// ./Web_Toolkit/instagram_clone/bin/instagram-clone.mjs
/**
 * Clone a public Instagram profile into local feed JSON and media for Astro sites.
 *
 * Usage:
 *   instagram-clone clone --project-root <path> [--username <handle>]
 *   instagram-clone audit --project-root <path>
 *
 * Username resolution order:
 *   1. --username
 *   2. INSTAGRAM_USERNAME in target project .env
 *   3. instagram.username (or social link) in site profile
 */

import { runClone } from '../src/commands/clone.mjs';
import { runAudit } from '../src/commands/audit.mjs';
import { resolvePortableRoot } from '../../shared/lib/context.mjs';
import { parseCliArgs } from '../../shared/lib/cli.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import {
  formatMissingUsernameHelp,
  resolveCloneContext,
} from '../src/lib/resolve-context.mjs';

resolvePortableRoot(import.meta.url, 2);

function printHelp() {
  return printStandardHelp({
    name: 'instagram-clone',
    summary: 'Clone public Instagram feeds for static/portfolio sites',
    usage: [
      'instagram-clone clone [--project-root <path>] [--site-profile <path>] [--username <handle>] [--limit <n>] [--no-download] [--json]',
      'instagram-clone audit [--project-root <path>] [--json]'
    ],
    commands: [
      { name: 'clone', description: 'Fetch a public feed and write feed.json plus local media unless --no-download is set.' },
      { name: 'audit', description: 'Validate the feed JSON and referenced local media without network access.' }
    ],
    flags: [
      { name: '--project-root <path>', description: 'Target Astro project root; defaults to the current directory.' },
      { name: '--site-profile <path>', description: 'Use an explicit site profile when resolving the account handle.' },
      { name: '--username <handle>', description: 'Override project .env and site-profile username.' },
      { name: '--limit <n>', description: 'Maximum posts to fetch; defaults to 24 or INSTAGRAM_CLONE_LIMIT.' },
      { name: '--no-download', description: 'Write feed.json but keep remote media URLs.' },
      { name: '--json', description: 'Emit one machine-readable result object to stdout.' }
    ],
    examples: [
      'instagram-clone clone --project-root . --username example --json',
      'instagram-clone clone --project-root . --no-download',
      'instagram-clone audit --project-root . --json'
    ],
    notes: [
      'Clone writes into src/data/instagram/feed.json and public/assets/instagram/; audit is read-only.',
      'The handle is resolved from --username, target project .env, or the selected/unambiguous site profile.',
      'Only public Instagram profiles are supported; rate limits/private profiles are reported as errors.',
      'Environment variables belong in the target project .env: INSTAGRAM_USERNAME and INSTAGRAM_CLONE_LIMIT.'
    ],
    exitCodes: [
      { name: '0', description: 'Command completed successfully; audit found no issues.' },
      { name: '1', description: 'Usage, configuration, network, or audit failure.' }
    ]
  });
}

async function main() {
  const { command: positionals, flags } = parseCliArgs(process.argv.slice(2));
  const action = String(positionals[0] || 'help').toLowerCase();
  const jsonMode = Boolean(flags.json);

  if (flags.help || ['help', '-h'].includes(action)) {
    printHelp();
    return 0;
  }

  if (action === 'help') {
    printHelp();
    return 0;
  }

  if (!['clone', 'audit'].includes(action) || positionals.length !== 1) {
    throw new Error(`Unknown or incomplete command: ${positionals.join(' ') || '(empty)'}. Run --help for usage.`);
  }

  for (const option of ['project-root', 'site-profile', 'username', 'limit']) {
    if (Object.hasOwn(flags, option) && typeof flags[option] !== 'string') {
      throw new Error(`--${option} requires a value.`);
    }
  }

  const projectRoot = String(flags['project-root'] || process.cwd());
  const downloadMedia = !flags['no-download'];

  if (action === 'audit') {
    const summary = runAudit({ projectRoot, json: jsonMode });
    return summary.ok ? 0 : 1;
  }

  if (action === 'clone') {
    const context = resolveCloneContext({
      projectRoot,
      usernameFlag: String(flags.username || ''),
      siteProfileFlag: String(flags['site-profile'] || ''),
      limitFlag: String(flags.limit || ''),
    });

    if (!context.username) {
      throw new Error(formatMissingUsernameHelp(context));
    }

    const result = await runClone({
      projectRoot: context.projectRoot,
      username: context.username,
      limit: context.limit,
      downloadMedia,
      log: jsonMode ? () => {} : undefined,
    });
    if (jsonMode) process.stdout.write(`${JSON.stringify({ ok: true, command: action, username: context.username, ...result })}\n`);
    return 0;
  }
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  const jsonRequested = process.argv.slice(2).some((token) => token === '--json' || token.startsWith('--json='));
  if (jsonRequested) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { message: error.message ?? String(error) } })}\n`);
  } else {
    console.error('[instagram-clone]', error.message ?? error);
  }
  process.exitCode = 1;
});
