// ./Web_Toolkit/package_updater/src/commands/starters.mjs
/**
 * Keeps the toolkit's own site starters and templates current and consistent.
 *
 *   refresh-starters   resolve every starter/template package manifest with the same peer-aware resolver as a site,
 *                      and (with --apply) write the new ranges. Run on a schedule so new sites start on a current,
 *                      compatible toolchain and existing sites have a known-good target to move to.
 *   doctor             offline-safe lint of those manifests: no exact pins, no "latest", ranges are valid, engines use
 *                      a floor (>=), and a hold in policy.json always has a reason. With network it also reports
 *                      whether the resolver would change anything (drift).
 */

import fs from 'node:fs';
import path from 'node:path';
import { validRange } from '../../../shared/lib/semver-lite.mjs';
import { loadPolicy } from '../lib/policy.mjs';
import { isRegistrySpec } from '../lib/resolve.mjs';
import { planUpdates, renderPlan } from './update.mjs';

export function findStarterManifests(portableRoot) {
  const found = [];
  const starter = path.join(portableRoot, 'site-starter');
  if (fs.existsSync(starter)) {
    for (const name of fs.readdirSync(starter)) if (/package\.json$/.test(name)) found.push(path.join(starter, name));
  }
  const templates = path.join(portableRoot, 'Web_Toolkit', 'templates');
  const walk = (directory, depth = 0) => {
    if (depth > 3 || !fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name === 'package.json' || /\.package\.json$/.test(entry.name)) found.push(full);
    }
  };
  walk(templates);
  return found.sort();
}

/** Static lint of one manifest. Returns a list of problems (empty = fine). */
export function lintManifest(pkg, label) {
  const problems = [];
  for (const group of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, range] of Object.entries(pkg[group] ?? {})) {
      const text = String(range).trim();
      if (!isRegistrySpec(text)) continue;
      if (text === 'latest' || text === '*' || text === '') problems.push(`${label}: ${group}.${name} is "${text}"; use a ^ or >= range`);
      else if (/^\d+\.\d+\.\d+$/.test(text) || /^=/.test(text)) problems.push(`${label}: ${group}.${name} is the exact pin "${text}"; use ^${text.replace(/^=/, '')}`);
      else if (!validRange(text)) problems.push(`${label}: ${group}.${name} has an invalid range "${text}"`);
    }
  }
  const node = pkg.engines?.node;
  if (node && !/^>=/.test(String(node).trim())) problems.push(`${label}: engines.node "${node}" should be a floor like ">=26"`);
  return problems;
}

export async function runStarters(command, flags = {}, hooks = {}) {
  const log = hooks.log ?? ((text) => process.stdout.write(text));
  const portableRoot = path.resolve(flags['portable-root'] || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..'));
  const manifests = findStarterManifests(portableRoot);
  if (manifests.length === 0) {
    console.error(`[package-updater] no starter manifests found under ${portableRoot}`);
    return 1;
  }
  const policy = loadPolicy(portableRoot);
  const offline = flags.offline === true || flags.offline === 'true';
  let problems = 0;
  let drift = 0;
  let failures = 0;

  for (const file of manifests) {
    const label = path.relative(portableRoot, file);
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const lint = lintManifest(pkg, label);
    for (const problem of lint) log(`lint    ${problem}\n`);
    problems += lint.length;
    if (offline) continue;
    const plan = await planUpdates(pkg, policy, { fetchPackumentsFn: hooks.fetchPackumentsFn, projectRoot: portableRoot });
    if (plan.failed.length > 0) {
      failures += plan.failed.length;
      log(renderPlan(plan, `${label}`));
      continue;
    }
    const writes = [...plan.changes, ...plan.holds.filter((hold) => hold.changed)];
    drift += writes.length;
    if (writes.length > 0 || plan.holds.length > 0) log(renderPlan(plan, label));
    if (command === 'refresh-starters' && (flags.apply === true || flags.apply === 'true') && writes.length > 0) {
      for (const entry of writes) pkg[entry.group][entry.name] = entry.to;
      fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
      log(`wrote   ${label} (${writes.length} range${writes.length === 1 ? '' : 's'})\n`);
    }
  }
  log(`${command}: ${manifests.length} manifest(s), ${problems} lint problem(s)${offline ? '' : `, ${drift} range(s) behind${command === 'refresh-starters' && !(flags.apply === true || flags.apply === 'true') ? ' (dry-run; --apply writes)' : ''}`}\n`);
  if (failures > 0) return 1;
  if (problems > 0) return 2;
  if (command === 'doctor' && drift > 0 && (flags.strict === true || flags.strict === 'true')) return 2;
  return 0;
}
