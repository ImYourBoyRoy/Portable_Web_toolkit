// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/cache-purge.mjs
/**
 * Wrapper around the portable cache purge utility for cf-agent workflows.
 */

import path from 'node:path';
import { runCommand } from '../lib/exec.mjs';
import { loadSiteProfile, resolveProfilePath } from '../lib/profile.mjs';
import { PORTABLE_ROOT } from '../lib/paths.mjs';

export async function runCachePurge(flags = {}) {
  const site = loadSiteProfile(flags);
  const profilePath = resolveProfilePath(flags);
  const scriptPath = path.join(PORTABLE_ROOT, 'cache_purge', 'bin', 'cache-purge.mjs');
  const args = [
    scriptPath,
    '--site-profile',
    profilePath,
    '--project-root',
    site.projectRoot
  ];

  for (const [key, value] of Object.entries(flags)) {
    if (['profile', 'site-profile', 'project-root'].includes(key)) continue;
    args.push(`--${key}`);
    if (value !== true) args.push(String(value));
  }

  runCommand('node', args, { cwd: PORTABLE_ROOT, stdio: 'inherit' });
  return 0;
}

