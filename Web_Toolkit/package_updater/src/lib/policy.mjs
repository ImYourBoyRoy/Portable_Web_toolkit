// ./Web_Toolkit/package_updater/src/lib/policy.mjs
/**
 * Loads the toolchain policy: the toolkit default (policy.json beside the module) merged with an optional
 * `toolchain.policy.json` in the project, so a single site can add a documented hold without forking the toolkit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_POLICY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../policy.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function validatePolicy(policy, source = 'policy') {
  const errors = [];
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return [`${source} must be an object`];
  if (policy.anchors !== undefined && (!Array.isArray(policy.anchors) || policy.anchors.some((name) => typeof name !== 'string'))) errors.push(`${source}.anchors must be an array of package names`);
  if (policy.minimumReleaseAgeHours !== undefined && !(typeof policy.minimumReleaseAgeHours === 'number' && policy.minimumReleaseAgeHours >= 0)) errors.push(`${source}.minimumReleaseAgeHours must be a number of hours (0 disables)`);
  if (policy.ignore !== undefined && (!Array.isArray(policy.ignore) || policy.ignore.some((name) => typeof name !== 'string'))) errors.push(`${source}.ignore must be an array of package names`);
  for (const [name, hold] of Object.entries(policy.holds ?? {})) {
    if (!hold || typeof hold.range !== 'string' || hold.range.trim() === '') errors.push(`${source}.holds.${name}.range is required`);
    if (!hold || typeof hold.reason !== 'string' || hold.reason.trim() === '') errors.push(`${source}.holds.${name}.reason is required (a hold without a reason becomes permanent)`);
  }
  for (const [index, entry] of (policy.acceptPeerConflicts ?? []).entries()) {
    if (!entry || typeof entry.package !== 'string' || typeof entry.owner !== 'string') errors.push(`${source}.acceptPeerConflicts[${index}] needs package and owner`);
    if (!entry || typeof entry.reason !== 'string' || entry.reason.trim() === '') errors.push(`${source}.acceptPeerConflicts[${index}].reason is required (an accepted risk must say why and who accepted it)`);
  }
  return errors;
}

/**
 * How old a release must be before the updater may write a range that needs it. pnpm 12 enforces minimumReleaseAge
 * (default 24 h) and fails the install for younger releases, so the updater never proposes them. Order: the project's
 * pnpm-workspace.yaml `minimumReleaseAge:` (minutes), then policy `minimumReleaseAgeHours`, then 24 h. 0 disables.
 */
export function releaseAgeMs(policy, projectRoot) {
  try {
    const yaml = fs.readFileSync(path.join(projectRoot ?? '.', 'pnpm-workspace.yaml'), 'utf8');
    const match = /^minimumReleaseAge:\s*(\d+)/m.exec(yaml);
    if (match) return Number(match[1]) * 60_000;
  } catch {
    // no workspace file
  }
  const hours = policy?.minimumReleaseAgeHours ?? 24;
  return Number.isFinite(hours) && hours > 0 ? hours * 3_600_000 : 0;
}

export function loadPolicy(projectRoot, { defaultFile = DEFAULT_POLICY_FILE } = {}) {
  const base = readJson(defaultFile);
  const baseErrors = validatePolicy(base, defaultFile);
  if (baseErrors.length) throw new Error(baseErrors.join('; '));
  const local = path.join(projectRoot, 'toolchain.policy.json');
  if (!fs.existsSync(local)) return { ...base, source: defaultFile };
  const extra = readJson(local);
  const errors = validatePolicy(extra, local);
  if (errors.length) throw new Error(errors.join('; '));
  return {
    ...base,
    minimumReleaseAgeHours: extra.minimumReleaseAgeHours ?? base.minimumReleaseAgeHours,
    anchors: [...new Set([...(base.anchors ?? []), ...(extra.anchors ?? [])])],
    ignore: [...new Set([...(base.ignore ?? []), ...(extra.ignore ?? [])])],
    holds: { ...(base.holds ?? {}), ...(extra.holds ?? {}) },
    acceptPeerConflicts: [...(base.acceptPeerConflicts ?? []), ...(extra.acceptPeerConflicts ?? [])],
    source: `${defaultFile} + ${local}`
  };
}
