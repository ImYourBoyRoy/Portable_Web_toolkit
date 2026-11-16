// ./Web_Toolkit/package_updater/src/lib/resolve.mjs
/**
 * Peer-aware toolchain resolution. No version is pinned and no "cap table" is maintained by hand: for the direct
 * dependencies of a project, pick the newest set in which every package's peerDependencies/dependencies ranges are
 * satisfied by the others. A package that must stay behind (typescript < 7 because @astrojs/check peers
 * ^5 || ^6) is held with the reason, and lifts itself on the first run after a release that allows the new major.
 *
 * Anchors (astro) are solved around: if an integration has no release that supports the newest anchor major, the
 * anchor holds back to the newest version everything supports, and the report names the laggard.
 */

import { compare, major as majorOf, maxSatisfying, parse, satisfies, validRange } from '../../../shared/lib/semver-lite.mjs';

export function isRegistrySpec(spec) {
  const text = String(spec ?? '').trim();
  if (text === '' || /^(file|link|workspace|git|github|https?|npm):/.test(text) || text.includes('/')) return false;
  return validRange(text);
}

function sortedVersions(packument) {
  return [...packument.versions.entries()]
    .filter(([, meta]) => !meta.deprecated && !meta.tooNew)
    .map(([version]) => version)
    .sort((a, b) => compare(b, a));
}

/**
 * @param {object} input
 * @param {Record<string, string>} input.dependencies name -> current range (dependencies + devDependencies merged)
 * @param {Record<string, { versions: Map<string, object>, latest?: string, error?: string }>} input.packuments
 * @param {{ anchors?: string[], holds?: Record<string, { range: string, reason?: string }>, ignore?: string[] }} [input.policy]
 */
export function resolveToolchain({ dependencies, packuments, policy = {} }) {
  const ignore = new Set(policy.ignore ?? []);
  const holds = policy.holds ?? {};
  // A documented, user-accepted risk: ignore what `owner` says about `package` (policy.acceptPeerConflicts, reason required).
  const accepts = new Map((policy.acceptPeerConflicts ?? []).map((entry) => [`${entry.package}|${entry.owner}`, entry]));
  const acceptedApplied = new Map();
  const ownerName = (owner) => owner.slice(0, owner.lastIndexOf('@'));
  const names = Object.keys(dependencies).filter((name) => isRegistrySpec(dependencies[name]) && !ignore.has(name));
  const skipped = Object.keys(dependencies).filter((name) => !names.includes(name));
  const usable = names.filter((name) => packuments[name] && !packuments[name].error && [...(packuments[name].versions?.values() ?? [])].some((meta) => !meta.deprecated && !meta.tooNew));
  const failed = names.filter((name) => !usable.includes(name)).map((name) => ({ name, error: packuments[name]?.error ?? 'no stable versions' }));
  const anchors = (policy.anchors ?? []).filter((name) => usable.includes(name));

  const candidates = Object.fromEntries(usable.map((name) => [name, sortedVersions(packuments[name])]));
  const latest = Object.fromEntries(usable.map((name) => [name, candidates[name][0]]));
  // Newest release overall (including ones still inside the release-age window), for honest reporting.
  const overallNewest = Object.fromEntries(usable.map((name) => {
    const all = [...packuments[name].versions.entries()].filter(([, meta]) => !meta.deprecated).map(([version]) => version).sort((a, b) => compare(b, a));
    return [name, all[0] ?? latest[name]];
  }));

  const constraintsOn = (target, chosen) => {
    const found = [];
    for (const owner of usable) {
      const meta = packuments[owner].versions.get(chosen[owner]);
      if (!meta) continue;
      // Peers always constrain. Ordinary dependencies only constrain when the owner is an anchor (a second copy of the
      // framework's own bundler is a real bug source); transitive pins elsewhere may duplicate or be overridden.
      for (const kind of anchors.includes(owner) ? ['peerDependencies', 'dependencies'] : ['peerDependencies']) {
        const range = meta[kind]?.[target];
        if (!range) continue;
        const accepted = accepts.get(`${target}|${owner}`);
        if (accepted) {
          if (!satisfies(chosen[target], range)) acceptedApplied.set(`${target}|${owner}`, { package: target, owner, range, reason: accepted.reason });
          continue;
        }
        found.push({ owner: `${owner}@${chosen[owner]}`, range, kind });
      }
    }
    if (holds[target]) found.push({ owner: 'policy hold', range: holds[target].range, kind: 'hold', reason: holds[target].reason });
    return found;
  };

  const solve = (fixed) => {
    const chosen = { ...latest, ...fixed };
    const reasons = {};
    for (let round = 0; round < 60; round += 1) {
      let changed = false;
      for (const target of usable) {
        for (const constraint of constraintsOn(target, chosen)) {
          if (satisfies(chosen[target], constraint.range)) continue;
          if (target in fixed) return { failed: { target, constraint } };
          const next = maxSatisfying(candidates[target].filter((version) => compare(version, chosen[target]) <= 0), constraint.range);
          if (!next) return { failed: { target, constraint } };
          chosen[target] = next;
          reasons[target] = constraint;
          changed = true;
        }
      }
      if (!changed) return { chosen, reasons };
    }
    return { failed: { target: usable[0], constraint: { owner: 'resolver', range: 'did not converge' } } };
  };

  // Anchors: try the newest version of each major, newest major first; fall back until everything fits.
  let outcome = null;
  let anchorNote = null;
  const anchorChoices = anchors.length === 0 ? [{}] : cartesian(anchors.map((name) => anchorVersionsFor(name, candidates[name])));
  for (const fixed of anchorChoices) {
    const attempt = solve(fixed);
    if (attempt.chosen) {
      outcome = attempt;
      break;
    }
    anchorNote = anchorNote ?? attempt.failed;
  }
  if (!outcome) {
    return { choices: {}, skipped, failed: [...failed, { name: '(set)', error: `no compatible set found${anchorNote ? `: ${anchorNote.target} needs ${anchorNote.constraint.range} (${anchorNote.constraint.owner})` : ''}` }], conflict: anchorNote };
  }

  const choices = {};
  for (const name of usable) {
    const chosen = outcome.chosen[name];
    const newest = overallNewest[name];
    const ageHeld = compare(chosen, latest[name]) === 0 && compare(latest[name], newest) < 0;
    const newerMeta = packuments[name].versions.get(newest);
    const reason = outcome.reasons[name];
    const heldBack = compare(chosen, newest) < 0;
    const majorHeld = majorOf(chosen) < majorOf(newest);
    let why = null;
    if (ageHeld && !reason) {
      why = `${name}@${newest} was published ${newerMeta?.publishedAt ?? 'recently'}, inside the release-age window (policy minimumReleaseAgeHours); staying on ${chosen}`;
    } else if (anchors.includes(name) && heldBack) {
      why = anchorNote
        ? `${anchorNote.target} has no release for ${name} ${majorOf(newest)}.x yet (${anchorNote.constraint.owner} needs ${anchorNote.target} ${anchorNote.constraint.range})`
        : `held below ${newest}`;
    } else if (reason) {
      why = `${reason.owner} ${reason.kind === 'peerDependencies' ? 'peers' : reason.kind === 'hold' ? `holds (${reason.reason ?? 'policy'})` : 'depends on'} ${name} ${reason.range}`;
    }
    const blocker = ageHeld && !reason
      ? { owner: 'release-age window', ownerName: null, kind: 'age', range: null, until: newerMeta?.publishedAt ?? null, newest }
      : anchors.includes(name) && heldBack && anchorNote
      ? { owner: anchorNote.constraint.owner, ownerName: ownerName(anchorNote.constraint.owner), range: anchorNote.constraint.range, kind: anchorNote.constraint.kind, target: anchorNote.target }
      : reason ? { owner: reason.owner, ownerName: reason.kind === 'hold' ? null : ownerName(reason.owner), range: reason.range, kind: reason.kind, reason: reason.reason } : null;
    choices[name] = { current: dependencies[name], chosen, latest: newest, heldBack, majorHeld, reason: why, anchor: anchors.includes(name), blocker };
  }
  return { choices, skipped, failed, accepted: [...acceptedApplied.values()] };
}

/** Newest version of each major, newest major first, as candidate anchor pins. */
function anchorVersionsFor(name, versions) {
  const seen = new Set();
  const picks = [];
  for (const version of versions) {
    const major = parse(version).major;
    if (seen.has(major)) continue;
    seen.add(major);
    picks.push({ [name]: version });
  }
  return picks.slice(0, 4);
}

function cartesian(lists) {
  return lists.reduce((acc, list) => acc.flatMap((left) => list.map((right) => ({ ...left, ...right }))), [{}]);
}

/** Range text to write: keep an existing ~ ; keep >= but bound it below a held-back major; otherwise caret. */
export function formatRange(current, choice) {
  const operator = /^(\^|~|>=)/.exec(String(current).trim())?.[1] ?? '^';
  if (operator === '~') return `~${choice.chosen}`;
  if (operator === '>=') return choice.majorHeld ? `>=${choice.chosen} <${majorOf(choice.chosen) + 1}` : `>=${choice.chosen}`;
  return `^${choice.chosen}`;
}
