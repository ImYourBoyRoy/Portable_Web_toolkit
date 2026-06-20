// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/profile.mjs
/**
 * Shared site-profile loading helpers for the Cloudflare toolkit.
 */

import { loadSiteProfileContext } from '../../../shared/lib/context.mjs';
import { PORTABLE_ROOT } from './paths.mjs';

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').toLowerCase();
}

export function resolveProfilePath(flags = {}) {
  return loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags }).profilePath;
}

export function loadSiteProfile(flags = {}) {
  const site = loadSiteProfileContext({ portableRoot: PORTABLE_ROOT, flags });
  return {
    profilePath: site.profilePath,
    profile: site.profile,
    zoneName: site.zoneName,
    projectRoot: site.projectRoot,
    productionHosts: site.productionHosts,
    developmentHosts: site.developmentHosts,
    deployTarget: site.deployTarget
  };
}

export function hostsForEnvironment(site, environment = 'production') {
  return environment === 'development' ? site.developmentHosts : site.productionHosts;
}

export function projectRootMatchesProfile(site) {
  return normalizePath(site.projectRoot) === normalizePath(site.profile?.projectRoot || '');
}

