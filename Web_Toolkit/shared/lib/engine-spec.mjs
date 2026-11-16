// ./Web_Toolkit/shared/lib/engine-spec.mjs
/**
 * Single definition of how the toolkit asks its package manager (pnpm, or npm without it) for the WCAGate engine.
 *
 * The toolkit never pins a WCAGate version. It asks for a semver RANGE of release tags
 * (`github:imyourboyroy/WCAGate#semver:<range>`), so a fresh install and every freshness check land on the highest
 * published release that satisfies the range. `*` means "latest release" (prereleases are excluded by semver).
 * Change the range here and in Web_Toolkit/package.json (a test keeps the two equal).
 */

export const WCAGATE_REPOSITORY = 'https://github.com/imyourboyroy/WCAGate.git';
export const WCAGATE_REPOSITORY_SPEC = 'github:imyourboyroy/WCAGate';
export const WCAGATE_RANGE = '*';
export const WCAGATE_SPEC = `${WCAGATE_REPOSITORY_SPEC}#semver:${WCAGATE_RANGE}`;

import { compare, isStable, parse, satisfies } from './semver-lite.mjs';
import { isInstalled } from './package-manager.mjs';

/**
 * Which manager installs the engine into Web_Toolkit: pnpm when it is installed (the same default as every site), otherwise
 * npm, so a machine that only has Node can still bootstrap. `PORTABLE_TOOLKIT_PM=npm|pnpm` overrides.
 */
export function engineManager({ env = process.env, installed = isInstalled } = {}) {
  const forced = String(env.PORTABLE_TOOLKIT_PM || '').trim().toLowerCase();
  if (forced === 'npm' || forced === 'pnpm') return forced;
  return installed('pnpm') ? 'pnpm' : 'npm';
}

/**
 * The command that installs the engine (`install` from package.json), or re-resolves a spec (`add`/`install <spec>`; git
 * dependencies are not refetched by an update, so a refresh reinstalls the spec). The engine is never locked.
 * @returns {{ command: string, args: string[], manager: string }}
 */
export function engineInstallCommand({ spec = WCAGATE_SPEC, refresh = false, manager = engineManager() } = {}) {
  const withSpec = refresh || spec !== WCAGATE_SPEC;
  if (manager === 'pnpm') return { manager, command: 'pnpm', args: withSpec ? ['add', spec] : ['install'] };
  // npm 12+ defaults allow-git=none; WCAGate is a GitHub git dependency.
  return { manager, command: 'npm', args: ['install', ...(withSpec ? [spec] : []), '--allow-git=all', '--no-audit', '--no-fund', '--package-lock=false'] };
}

export function parseVersion(text) {
  const parsed = parse(text);
  return parsed && isStable(parsed) ? [parsed.major, parsed.minor, parsed.patch] : null;
}

export function compareVersions(a, b) {
  return compare({ major: a[0], minor: a[1], patch: a[2], pre: [] }, { major: b[0], minor: b[1], patch: b[2], pre: [] });
}

/** Any range semver-lite understands (`*`, `>=2.3.1`, `^2`, `~2.4`, `>=2 <4`, unions). Prereleases never match. */
export function satisfiesRange(version, range = WCAGATE_RANGE) {
  const parsed = Array.isArray(version) ? version : parseVersion(version);
  if (!parsed) return false;
  return satisfies(parsed.join('.'), range);
}

/**
 * Highest stable release tag in `git ls-remote --tags` output that satisfies the range.
 * @returns {{ tag: string, version: string, commit: string } | null}
 */
export function latestReleaseTag(lsRemoteOutput, range = WCAGATE_RANGE) {
  const tags = new Map();
  for (const line of String(lsRemoteOutput).split('\n')) {
    const match = /^([0-9a-f]{7,64})\s+refs\/tags\/([^\s^]+)(\^\{\})?$/.exec(line.trim());
    if (!match) continue;
    const version = parseVersion(match[2]);
    if (!version || !satisfiesRange(version, range)) continue;
    const previous = tags.get(match[2]);
    // The peeled (^{}) line is the commit an annotated tag points at; prefer it.
    if (!previous || match[3]) tags.set(match[2], { tag: match[2], version, commit: match[1] });
  }
  const best = [...tags.values()].sort((a, b) => compareVersions(b.version, a.version))[0];
  return best ? { tag: best.tag, version: best.version.join('.'), commit: best.commit } : null;
}
