// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/deploy.mjs
/**
 * Profile-driven deploy wrapper for dev/prod workflows.
 *
 * Runs the portable setup tool first, then executes the site profile's deploy
 * command. Dry-run is the default; use `--apply` to execute commands.
 */

import path from 'node:path';
import process from 'node:process';
import { runCommand } from '../lib/exec.mjs';
import { mergedEnv } from '../lib/env.mjs';
import { loadSiteProfile, resolveProfilePath } from '../lib/profile.mjs';
import { toBool } from '../lib/format.mjs';
import { PORTABLE_ROOT } from '../lib/paths.mjs';
import { validateDeployCommand } from '../../../shared/lib/site-profile.mjs';

function runShellCommand(command, cwd, env = {}) {
  const options = { cwd, env, stdio: 'inherit' };
  if (process.platform === 'win32') {
    return runCommand('cmd', ['/d', '/s', '/c', command], options);
  }
  return runCommand('sh', ['-lc', command], options);
}

export async function runDeploy(target, flags = {}) {
  const normalizedTarget = target === 'dev' ? 'development' : target === 'prod' ? 'production' : target;
  const site = loadSiteProfile(flags);
  const env = mergedEnv([path.join(site.projectRoot, '.env')]);
  const apply = toBool(flags.apply, false);
  const setupBin = path.join(PORTABLE_ROOT, 'Setup_astro_environment', 'bin', 'astro-env-setup.mjs');
  const profilePath = resolveProfilePath(flags);
  const deployCommand = site.profile?.commands?.deploy?.[normalizedTarget];

  if (!deployCommand) {
    throw new Error(`No deploy command configured for ${normalizedTarget} in ${profilePath}`);
  }

  const deployValidation = validateDeployCommand(deployCommand, `commands.deploy.${normalizedTarget}`);
  if (!deployValidation.ok) {
    throw new Error(deployValidation.error);
  }

  console.log('\nCloudflare deploy wrapper');
  console.log(`- Profile: ${site.profile.siteId}`);
  console.log(`- Environment: ${normalizedTarget}`);
  console.log(`- Project root: ${site.projectRoot}`);
  console.log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);
  console.log(`- Setup tool: node ${setupBin} prepare-project --project-root "${site.projectRoot}" --site-profile "${profilePath}"`);
  console.log(`- Deploy command: ${deployCommand}`);

  if (!apply) {
    console.log('- Dry-run only. Re-run with --apply to execute.');
    return 0;
  }

  runCommand('node', [setupBin, 'prepare-project', '--project-root', site.projectRoot, '--site-profile', profilePath], {
    cwd: PORTABLE_ROOT,
    env,
    stdio: 'inherit'
  });
  runShellCommand(deployCommand, site.projectRoot, env);
  return 0;
}

