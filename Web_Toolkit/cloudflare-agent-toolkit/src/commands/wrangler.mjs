// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/wrangler.mjs
/**
 * Wrangler utility commands for cf-agent.
 *
 * Handles installer/update actions and quick version/status checks to reduce
 * setup friction in new environments.
 */

import { installOrUpdateWrangler, wranglerVersion, wranglerWhoami } from '../lib/wrangler.mjs';
import { toBool } from '../lib/format.mjs';

export async function runWranglerCommand(subcommand, flags = {}) {
  const cmd = String(subcommand || 'version').trim().toLowerCase();

  if (cmd === 'install' || cmd === 'update' || cmd === 'ensure') {
    const globalInstall = toBool(flags.global, false);
    installOrUpdateWrangler({ global: globalInstall });
    console.log(`\nWrangler ${cmd === 'install' ? 'install' : 'update'} complete (${globalInstall ? 'global' : 'local devDependency'}).`);
    return 0;
  }

  if (cmd === 'status') {
    const whoami = wranglerWhoami();
    console.log('\nWrangler status');
    console.log(`- Version: ${wranglerVersion() || 'not installed'}`);
    console.log(`- Authenticated: ${whoami.status === 0 ? 'yes' : 'no'}`);
    return whoami.status === 0 ? 0 : 2;
  }

  console.log(wranglerVersion() || 'Wrangler not found');
  return 0;
}


