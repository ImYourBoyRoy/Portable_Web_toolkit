// ./Web_Toolkit/package_updater/src/commands/update.mjs
/**
 * Update a client project's dependency ranges to the newest set whose peers agree, with Astro handled by its official
 * upgrader, and prove the result before keeping it.
 *
 * Flow (dry-run unless --apply):
 *   1. Astro projects: official `@astrojs/upgrade` through the project's package manager (pnpm by default).
 *   2. Peer-aware resolution (lib/resolve.mjs): newest compatible set; anything held back is printed with its reason,
 *      and lifts itself on the first run after a release that allows the new major. No version table is maintained by
 *      hand and nothing is pinned exactly.
 *   3. --apply: write ranges, install, then verify (`check` and `build` scripts when present). A failed install or
 *      verification restores package.json and the lockfile, re-installs, and exits 1, so a bad major never lands silently.
 *
 * Range operators are preserved (^ default, ~ kept, >= kept and bounded below a held-back major).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { commandsFor, describe, detectPackageManager, runPackageManager } from '../../../shared/lib/package-manager.mjs';
import { isAstroProject, runAstroUpgrade } from '../lib/astro-upgrade.mjs';
import { loadPolicy, releaseAgeMs } from '../lib/policy.mjs';
import { fetchPackuments } from '../lib/registry.mjs';
import { formatRange, resolveToolchain } from '../lib/resolve.mjs';
import { major as majorOf, satisfies } from '../../../shared/lib/semver-lite.mjs';

const DEP_GROUPS = ['dependencies', 'devDependencies'];
const LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'bun.lock', 'bun.lockb'];

function boolFlag(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function readPackageJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * What a model needs to explain a hold to the user and offer a choice: the cause, what the blocker's NEWEST release
 * says, when it lifts, and the options (wait / accept the risk in policy / for an anchor, move the laggard).
 */
export function explainHold(name, choice, packuments) {
  const blocker = choice.blocker;
  const detail = { name, current: choice.current, chosen: choice.chosen, latest: choice.latest, blockedBy: blocker?.owner ?? null, blockerKind: blocker?.kind ?? null, blockerRange: blocker?.range ?? null, blockerLatest: null, blockerLatestAllowsLatest: null, liftsWhen: null, options: [] };
  const target = blocker?.target ?? name;
  if (blocker?.ownerName && packuments[blocker.ownerName]?.latest) {
    const latestOwner = packuments[blocker.ownerName].latest;
    const meta = packuments[blocker.ownerName].versions?.get(latestOwner);
    const declared = meta?.peerDependencies?.[target] ?? meta?.dependencies?.[target] ?? null;
    detail.blockerLatest = { version: latestOwner, declares: declared };
    detail.blockerLatestAllowsLatest = declared ? satisfies(choice.latest, declared) : null;
  }
  if (blocker?.kind === 'age') {
    detail.liftsWhen = `automatically once ${name}@${blocker.newest} is old enough${blocker.until ? ` (published ${blocker.until})` : ''}; the next run picks it up`;
    detail.options.push({ id: 'wait', recommended: true, text: `Stay on ${choice.chosen}. pnpm 12 (minimumReleaseAge) refuses releases younger than the window, so a range needing ${blocker.newest} would fail installs today.` }, { id: 'bypass-age', text: `Only for an urgent security fix: allow it for this package in pnpm-workspace.yaml (minimumReleaseAgeExclude) or set policy minimumReleaseAgeHours lower, with the user's approval.` });
  } else if (blocker?.kind === 'hold') {
    detail.liftsWhen = 'when the policy hold is removed (policy.json / toolchain.policy.json)';
    detail.options.push({ id: 'keep-hold', recommended: true, text: `Keep ${name} on ${choice.chosen}: ${blocker.reason ?? 'documented policy hold'}.` }, { id: 'remove-hold', text: 'Remove the hold from the policy file if the reason no longer applies, then re-run.' });
  } else if (choice.anchor) {
    detail.liftsWhen = `when ${blocker?.target ?? 'the lagging package'} publishes a release that supports ${name} ${majorOf(choice.latest)}.x`;
    detail.options.push({ id: 'wait', recommended: true, text: `Stay on ${name} ${choice.chosen}. It is fully supported and still receives fixes; the upgrade guide for ${majorOf(choice.latest)}.x is ready when the integration catches up.` }, { id: 'drop-or-replace', text: `If ${blocker?.target ?? 'that integration'} is not essential, removing or replacing it unblocks ${name} ${majorOf(choice.latest)}.x now.` });
  } else if (blocker) {
    detail.liftsWhen = detail.blockerLatestAllowsLatest
      ? `now: ${blocker.ownerName}@${detail.blockerLatest.version} already allows ${name} ${choice.latest}; ${blocker.owner} is older than the newest release, so upgrade it`
      : `when ${blocker.ownerName ?? 'the blocker'} publishes a release whose peer range allows ${name} ${majorOf(choice.latest)}.x${detail.blockerLatest ? ` (its newest, ${detail.blockerLatest.version}, declares ${name} ${detail.blockerLatest.declares ?? 'no range'})` : ''}`;
    detail.options.push(
      { id: 'wait', recommended: true, text: `Stay on ${name} ${choice.chosen}; it lifts itself on the first run after the blocker allows ${majorOf(choice.latest)}.x.` },
      { id: 'accept-risk', text: `Use ${name} ${choice.latest} anyway: add { "package": "${name}", "owner": "${blocker.ownerName}", "reason": "..." } to toolchain.policy.json acceptPeerConflicts. ${blocker.ownerName} does not claim to support it, so expect type or build failures; only with the user's approval, and re-check later.` }
    );
  }
  return detail;
}

/** Pure planning step shared by `run`, `check`, and `refresh-starters`. */
export async function planUpdates(pkg, policy, { fetchPackumentsFn, projectRoot } = {}) {
  const minimumAgeMs = releaseAgeMs(policy, projectRoot);
  const fetcher = fetchPackumentsFn ?? ((names) => fetchPackuments(names, { minimumAgeMs }));
  const merged = {};
  const groupOf = {};
  for (const group of DEP_GROUPS) {
    for (const [name, range] of Object.entries(pkg[group] ?? {})) {
      merged[name] = range;
      groupOf[name] = group;
    }
  }
  const packuments = await fetcher(Object.keys(merged));
  const result = resolveToolchain({ dependencies: merged, packuments, policy });
  const changes = [];
  const holds = [];
  const current = [];
  for (const [name, choice] of Object.entries(result.choices)) {
    const next = formatRange(choice.current, choice);
    if (choice.majorHeld || (choice.heldBack && choice.reason)) holds.push({ name, group: groupOf[name], from: choice.current, to: next, latest: choice.latest, reason: choice.reason, anchor: choice.anchor, changed: next !== choice.current });
    else if (next !== choice.current) changes.push({ name, group: groupOf[name], from: choice.current, to: next });
    else current.push(name);
  }
  const heldDetails = holds.map((hold) => ({ ...hold, ...explainHold(hold.name, result.choices[hold.name], packuments) }));
  return { result, changes, holds: heldDetails, current, failed: result.failed, skipped: result.skipped, groupOf, accepted: result.accepted ?? [] };
}

export function renderPlan(plan, header) {
  const lines = [header];
  for (const change of plan.changes) lines.push(`update  ${change.name} ${change.from} -> ${change.to}`);
  for (const hold of plan.holds) {
    const move = hold.changed ? `${hold.from} -> ${hold.to}` : `${hold.from} (stays)`;
    lines.push(`hold    ${hold.name} ${move} | latest ${hold.latest} | ${hold.reason}`);
    if (hold.liftsWhen) lines.push(`        lifts: ${hold.liftsWhen}`);
    const options = hold.options.map((option) => `${option.id}${option.recommended ? ' (recommended)' : ''}`).join(', ');
    if (options) lines.push(`        options: ${options}${hold.anchor ? ` | upgrade guide: https://docs.astro.build/en/guides/upgrade-to/v${majorOf(hold.latest)}/` : ''}`);
  }
  for (const entry of plan.accepted ?? []) lines.push(`accepted risk: ${entry.package} newer than ${entry.owner} supports (${entry.range}): ${entry.reason}`);
  if (plan.current.length > 0) lines.push(`current ${plan.current.length} package${plan.current.length === 1 ? '' : 's'}`);
  if (plan.skipped.length > 0) lines.push(`skipped ${plan.skipped.join(', ')} (not registry ranges)`);
  for (const failure of plan.failed) lines.push(`error   ${failure.name}: ${failure.error}`);
  return `${lines.join('\n')}\n`;
}

function snapshot(projectRoot) {
  const files = ['package.json', ...LOCKFILES].map((name) => path.join(projectRoot, name)).filter((file) => fs.existsSync(file));
  return files.map((file) => ({ file, content: fs.readFileSync(file) }));
}

function restore(saved) {
  for (const { file, content } of saved) fs.writeFileSync(file, content);
}

function runStep(pm, args, projectRoot, hooks) {
  if (hooks.runStepFn) return hooks.runStepFn(pm, args, projectRoot);
  return runPackageManager(pm, args, { spawnOptions: { cwd: projectRoot, timeout: 600_000 } }).status ?? 1;
}

/**
 * @param {object} flags
 * @param {{ runAstroUpgradeFn?: Function, fetchPackumentsFn?: Function, runStepFn?: Function, log?: (text: string) => void }} [hooks]
 */
export async function runPackageUpdate(flags = {}, hooks = {}) {
  const jsonMode = flags.json === true || flags.json === 'true';
  // --json: stdout carries exactly one JSON document (the plan); progress text moves to stderr.
  const log = hooks.log ?? ((text) => (jsonMode ? process.stderr : process.stdout).write(text));
  const projectRoot = path.resolve(flags['project-root'] || '.');
  const apply = boolFlag(flags.apply, false);
  const skipAstroUpgrade = boolFlag(flags['skip-astro-upgrade'], false);
  const astroTag = typeof flags['astro-tag'] === 'string' && flags['astro-tag'].trim() ? flags['astro-tag'].trim() : 'latest';
  const runAstroUpgradeFn = hooks.runAstroUpgradeFn || runAstroUpgrade;

  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error(`[package-updater] package.json not found at ${pkgPath}`);
    return 1;
  }
  let pkg;
  try {
    pkg = readPackageJson(pkgPath);
  } catch (error) {
    console.error(`[package-updater] failed to read/parse package.json: ${error.message}`);
    return 1;
  }

  const pm = detectPackageManager(projectRoot, { flag: typeof flags['package-manager'] === 'string' ? flags['package-manager'] : undefined });
  const astroProject = isAstroProject(pkg, projectRoot);
  let policy;
  try {
    policy = loadPolicy(projectRoot);
  } catch (error) {
    console.error(`[package-updater] ${error.message}`);
    return 1;
  }

  const saved = apply ? snapshot(projectRoot) : [];

  if (astroProject && !skipAstroUpgrade) {
    log(`[package-updater] Astro project: official @astrojs/upgrade (${apply ? 'apply' : 'dry-run'}) via ${pm.name}\n`);
    const result = await runAstroUpgradeFn({ projectRoot, apply, tag: astroTag, packageManager: pm.name });
    if (result.code !== 0) {
      console.error(`[package-updater] FAILED: @astrojs/upgrade exited ${result.code}${result.reason ? ` (${result.reason})` : ''}`);
      if (apply) restore(saved);
      return 1;
    }
    try {
      pkg = readPackageJson(pkgPath);
    } catch (error) {
      console.error(`[package-updater] failed to re-read package.json after Astro upgrade: ${error.message}`);
      return 1;
    }
  } else if (astroProject) {
    log('[package-updater] skipping @astrojs/upgrade (--skip-astro-upgrade).\n');
  }

  const plan = await planUpdates(pkg, policy, { fetchPackumentsFn: hooks.fetchPackumentsFn, projectRoot });
  log(renderPlan(plan, `[package-updater] ${projectRoot} | ${pm.name} (${pm.source}) | ${apply ? 'apply' : 'dry-run'}`));
  if (jsonMode) {
    const strip = ({ result, groupOf, ...rest }) => rest;
    process.stdout.write(`${JSON.stringify({ project: projectRoot, packageManager: pm.name, mode: apply ? 'apply' : 'dry-run', ...strip(plan) })}\n`);
  }

  const toWrite = [...plan.changes, ...plan.holds.filter((hold) => hold.changed)];
  if (plan.failed.length > 0) {
    console.error(`[package-updater] FAILED: ${plan.failed.length} package(s) could not be resolved; nothing was written.`);
    if (apply) restore(saved);
    return 1;
  }
  if (toWrite.length === 0) {
    log('[package-updater] already current.\n');
    return 0;
  }
  if (!apply) {
    log(`[package-updater] ${toWrite.length} range update(s) available. Re-run with --apply to write, install, and verify (a failure restores the previous files).\n`);
    return 0;
  }

  for (const entry of toWrite) pkg[entry.group][entry.name] = entry.to;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  log(`[package-updater] wrote ${toWrite.length} range update(s).\n`);

  const rollback = (why) => {
    restore(saved);
    console.error(`[package-updater] FAILED: ${why}. Restored package.json and the lockfile.`);
    if (!boolFlag(flags['skip-install'], false)) runStep(pm.name, commandsFor(pm.name).install(), projectRoot, hooks);
    return 1;
  };

  if (!boolFlag(flags['skip-install'], false)) {
    log(`[package-updater] ${describe(pm.name, commandsFor(pm.name).install())}\n`);
    if (runStep(pm.name, commandsFor(pm.name).install(), projectRoot, hooks) !== 0) return rollback('install failed');
  }
  if (!boolFlag(flags['skip-verify'], false) && !boolFlag(flags['skip-install'], false)) {
    for (const script of ['check', 'build']) {
      if (!pkg.scripts?.[script]) continue;
      log(`[package-updater] verify: ${describe(pm.name, commandsFor(pm.name).run(script))}\n`);
      if (runStep(pm.name, commandsFor(pm.name).run(script), projectRoot, hooks) !== 0) return rollback(`\`${script}\` failed after the update`);
    }
    log('[package-updater] verified: install, check, and build succeed.\n');
  }
  return 0;
}
