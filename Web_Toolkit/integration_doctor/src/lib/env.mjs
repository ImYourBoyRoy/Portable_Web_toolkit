// ./Web_Toolkit/integration_doctor/src/lib/env.mjs
/**
 * Env-file inspection helpers for integration-doctor.
 */

import path from 'node:path';
import { PORTABLE_ROOT, loadEnv } from './paths.mjs';

function sortedKeys(values = {}) {
  return Object.keys(values).sort();
}

export function collectEnvState(projectRoot) {
  const envExamplePath = path.join(projectRoot, '.env.example');
  const envPath = path.join(projectRoot, '.env');
  const portableEnvPath = path.join(PORTABLE_ROOT, '.env');
  const envExample = loadEnv(envExamplePath);
  const projectEnv = loadEnv(envPath);
  const portableEnv = loadEnv(portableEnvPath);
  return {
    envExamplePath,
    envPath,
    portableEnvPath,
    envExampleExists: sortedKeys(envExample).length > 0,
    envExists: sortedKeys(projectEnv).length > 0,
    portableEnvExists: sortedKeys(portableEnv).length > 0,
    envExample,
    projectEnv,
    portableEnv,
    envExampleKeys: sortedKeys(envExample),
    projectEnvKeys: sortedKeys(projectEnv),
    portableEnvKeys: sortedKeys(portableEnv),
    cloudflareTokenSource: projectEnv.CLOUDFLARE_API_TOKEN ? 'project' : portableEnv.CLOUDFLARE_API_TOKEN ? 'portable' : 'missing'
  };
}

export function inspectExpectedKeys(expectedKeys = [], envState = {}) {
  const keys = [...new Set((expectedKeys || []).filter(Boolean))].sort();
  const example = new Set(envState.envExampleKeys || []);
  const project = new Set(envState.projectEnvKeys || []);
  const portable = new Set(envState.portableEnvKeys || []);
  const presentInProject = keys.filter((key) => project.has(key));
  const presentInPortable = keys.filter((key) => portable.has(key));
  const missing = keys.filter((key) => !project.has(key) && !portable.has(key));
  const missingFromExample = keys.filter((key) => !example.has(key));
  const portableOnly = keys.filter((key) => !project.has(key) && portable.has(key));
  return {
    expected: keys,
    presentInProject,
    presentInPortable,
    portableOnly,
    missing,
    missingFromExample,
    ok: missing.length === 0
  };
}

