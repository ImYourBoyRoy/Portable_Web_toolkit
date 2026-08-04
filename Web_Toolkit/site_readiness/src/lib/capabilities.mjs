// ./Web_Toolkit/site_readiness/src/lib/capabilities.mjs
/**
 * Probe what this environment can safely run (sandbox vs local vs full access).
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from '../../../shared/lib/env.mjs';

const NETWORK_PROBE_URL = 'https://cloudflare.com/cdn-cgi/trace';
const NETWORK_TIMEOUT_MS = 4000;

function hasSandboxHints() {
  const hints = [];
  const markers = [
    ['CI', process.env.CI],
    ['CURSOR_SANDBOX', process.env.CURSOR_SANDBOX],
    ['SANDBOX', process.env.SANDBOX],
    ['AGENT_SANDBOX', process.env.AGENT_SANDBOX],
  ];
  for (const [name, value] of markers) {
    if (String(value || '').trim() && !['0', 'false'].includes(String(value).toLowerCase())) {
      hints.push(`${name} is set`);
    }
  }
  return hints;
}

async function probeNetwork() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    const response = await fetch(NETWORK_PROBE_URL, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export function resolveToolkitRoot(projectRoot) {
  const candidates = [
    process.env.WEB_TOOLKIT_ROOT,
    path.join(projectRoot, 'Web_Toolkit'),
    path.join(projectRoot, 'web_toolkit'),
    path.join(projectRoot, '../Portable_Web_toolkit/Web_Toolkit'),
  ].filter(Boolean);

  return candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'discovery_doctor', 'bin', 'discovery-doctor.mjs')),
  ) || '';
}

export function resolveDistPath(projectRoot, deployTarget = '') {
  const clientDist = path.join(projectRoot, 'dist', 'client');
  const flatDist = path.join(projectRoot, 'dist');
  if (deployTarget === 'workers' && fs.existsSync(clientDist)) return clientDist;
  if (fs.existsSync(flatDist)) return flatDist;
  if (fs.existsSync(clientDist)) return clientDist;
  return '';
}

export async function probeCapabilities({ projectRoot, deployTarget = '', profile = null } = {}) {
  const projectEnv = loadEnvFile(path.join(projectRoot, '.env'));
  const env = { ...projectEnv, ...process.env };
  const sandboxHints = hasSandboxHints();
  const network = await probeNetwork();
  const toolkitRoot = resolveToolkitRoot(projectRoot);
  const distPath = resolveDistPath(projectRoot, deployTarget);
  const nodeModules = fs.existsSync(path.join(projectRoot, 'node_modules'));
  const feedJson = fs.existsSync(path.join(projectRoot, 'src', 'data', 'instagram', 'feed.json'));
  const wcagConfigCandidates = [
    path.join(projectRoot, 'wcag-auditor.config.mjs'),
    path.join(projectRoot, 'wcag-auditor.config.js'),
    path.join(projectRoot, 'wcag-auditor.config.json'),
  ];
  const profileWcagConfig = String(profile?.diagnostics?.wcagAuditor?.config || '').trim();
  if (profileWcagConfig) {
    wcagConfigCandidates.unshift(path.resolve(projectRoot, profileWcagConfig));
  }
  const wcagAuditorConfig = wcagConfigCandidates.find((candidate) => fs.existsSync(candidate)) || '';
  const wcagAuditorEnabled = Boolean(profile?.diagnostics?.wcagAuditor?.enabled);

  const cloudflareAuth = Boolean(
    String(env.CLOUDFLARE_API_TOKEN || '').trim()
    && String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim(),
  );

  let mode = 'local';
  if (!network || sandboxHints.length) mode = 'sandbox';
  else if (cloudflareAuth) mode = 'full';

  let writableProject = true;
  try {
    if (fs.existsSync(projectRoot)) fs.accessSync(projectRoot, fs.constants.W_OK);
  } catch {
    writableProject = false;
  }

  return {
    mode,
    network,
    cloudflareAuth,
    toolkitLinked: Boolean(toolkitRoot),
    toolkitRoot,
    nodeModules,
    distBuilt: Boolean(distPath),
    distPath,
    feedJson,
    wcagAuditorConfig,
    wcagAuditorEnabled,
    sandboxHints,
    writableProject,
  };
}
