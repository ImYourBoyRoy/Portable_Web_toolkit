// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/site-harden.mjs
/**
 * Profile-driven wrapper around zone hardening.
 *
 * Converts `--apply` into the underlying dry-run contract and injects the
 * profile's zone/host values automatically.
 */

import { runZoneHarden } from './zone-harden.mjs';
import { loadSiteProfile } from '../lib/profile.mjs';
import { toBool } from '../lib/format.mjs';

export async function runSiteHarden(flags = {}) {
  const site = loadSiteProfile(flags);
  const apply = toBool(flags.apply, false);
  return runZoneHarden({
    ...flags,
    zone: site.zoneName,
    hosts: [...site.productionHosts, ...site.developmentHosts].join(','),
    'dry-run': !apply
  });
}

