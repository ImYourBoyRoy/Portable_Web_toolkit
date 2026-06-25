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
import {
  formatMissingUsernameHelp,
  resolveCloneContext,
} from '../src/lib/resolve-context.mjs';

function printHelp() {
  console.log('instagram-clone — Clone public Instagram feeds for static/portfolio sites');
  console.log('');
  console.log('Usage:');
  console.log('  instagram-clone clone --project-root <path> [--username <handle>]');
  console.log('  instagram-clone audit --project-root <path>');
  console.log('');
  console.log('Options:');
  console.log('  --username <handle>   Override INSTAGRAM_USERNAME / site profile');
  console.log('  --site-profile <p>  Explicit site profile path');
  console.log('  --limit <n>           Max posts (default 24, or INSTAGRAM_CLONE_LIMIT)');
  console.log('  --no-download         Write feed.json only (keep remote media URLs)');
  console.log('');
  console.log('Environment (target project .env):');
  console.log('  INSTAGRAM_USERNAME=<handle>');
  console.log('  INSTAGRAM_CLONE_LIMIT=24');
}

function readFlag(args, name, fallback = '') {
  const idx = args.indexOf(name);
  return idx === -1 ? fallback : args[idx + 1];
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command || ['help', '--help', '-h'].includes(String(command).toLowerCase())) {
    printHelp();
    process.exit(command ? 0 : 1);
  }

  const projectRoot = readFlag(args, '--project-root', process.cwd());
  const downloadMedia = !args.includes('--no-download');

  if (command === 'audit') {
    runAudit({ projectRoot });
    return;
  }

  if (command === 'clone') {
    const context = resolveCloneContext({
      projectRoot,
      usernameFlag: readFlag(args, '--username', ''),
      siteProfileFlag: readFlag(args, '--site-profile', ''),
      limitFlag: readFlag(args, '--limit', ''),
    });

    if (!context.username) {
      console.error(formatMissingUsernameHelp(context));
      process.exit(1);
    }

    await runClone({
      projectRoot: context.projectRoot,
      username: context.username,
      limit: context.limit,
      downloadMedia,
    });
    return;
  }

  console.error(`[ERROR] Unknown command: ${command}`);
  process.exit(1);
}

main().catch((error) => {
  console.error('[instagram-clone]', error.message ?? error);
  process.exit(1);
});
