// ./Web_Toolkit/shared/lib/auto-update.mjs
/**
 * Throttled, fail-open freshness preflight for the portable toolkit.
 *
 * The preflight may update two independent resources:
 *   1. this toolkit, but only from a clean public-repository main branch that
 *      can fast-forward to origin/main;
 *   2. WCAGate, the highest published release tag that satisfies the semver range in
 *      engine-spec.mjs (never a pinned version), installed into the toolkit's ignored
 *      node_modules directory.
 *
 * It never overwrites dirty work, feature branches, unmanaged repositories, or
 * exported toolkit folders. Runtime state is intentionally kept under
 * Web_Toolkit/.runtime/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSyncCross } from './spawn-cross.mjs';
import {
  WCAGATE_RANGE,
  WCAGATE_REPOSITORY,
  WCAGATE_SPEC,
  compareVersions,
  engineInstallCommand,
  latestReleaseTag,
  parseVersion
} from './engine-spec.mjs';

const TOOLKIT_REPOSITORY = 'github.com/imyourboyroy/portable_web_toolkit';
const TOOLKIT_BRANCH = 'main';
const STATE_FILE = path.join('.runtime', 'toolkit-auto-update.json');
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 60 * 1000;
const TEST_ARGUMENTS = new Set(['--test', '--test-only', '--experimental-test-coverage']);

function boolEnv(name, fallback, env = process.env) {
  const value = String(env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

function intervalMs() {
  const hours = Number(process.env.PORTABLE_TOOLKIT_UPDATE_INTERVAL_HOURS || 24);
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_INTERVAL_MS;
  return Math.round(hours * 60 * 60 * 1000);
}

function statePath(portableRoot) {
  return path.join(portableRoot, STATE_FILE);
}

function readState(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function run(command, args, options = {}) {
  const result = spawnSyncCross(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
    timeout: options.timeout ?? 45_000,
    maxBuffer: 2 * 1024 * 1024
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error ? String(result.error.message || result.error) : ''
  };
}

function git(root, args, options = {}) {
  return run('git', ['-C', root, ...args], options);
}

function lastLine(value) {
  const lines = String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) || '';
}

function canonicalGitRemote(value) {
  return String(value || '')
    .trim()
    .replace(/^git\+/, '')
    .replace(/^ssh:\/\//, '')
    .replace(/^git@/, '')
    .replace(/github\.com:/i, 'github.com/')
    .replace(/^https?:\/\//i, '')
    .replace(/\.git(?:\/)?$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function isExpectedToolkitRemote(value) {
  return canonicalGitRemote(value) === TOOLKIT_REPOSITORY;
}

const SKIP_INVOCATION_ARGUMENTS = new Set(['--help', '-h', 'help', '--version', '--apply']);

/**
 * Help/version output must stay instant and side-effect free, and `--apply`
 * mutations (deploys, purges, DNS) must not run against source that was just
 * fast-forwarded underneath them. Opt back in with PORTABLE_TOOLKIT_AUTO_UPDATE_ON_APPLY=1.
 */
export function shouldSkipForInvocation(argv = process.argv.slice(2), env = process.env) {
  const hit = argv.find((arg) => SKIP_INVOCATION_ARGUMENTS.has(String(arg)));
  if (!hit) return '';
  if (hit === '--apply' && boolEnv('PORTABLE_TOOLKIT_AUTO_UPDATE_ON_APPLY', false, env)) return '';
  return hit;
}

function isTestProcess() {
  return Boolean(process.env.NODE_TEST_CONTEXT)
    || process.argv.some((arg) => TEST_ARGUMENTS.has(arg))
    || process.execArgv.some((arg) => TEST_ARGUMENTS.has(arg));
}

function validEngineRoot(portableRoot) {
  const root = path.join(portableRoot, 'node_modules', '@imyourboyroy', 'wcagate');
  const packagePath = path.join(root, 'package.json');
  if (!fs.existsSync(packagePath)) return { root, valid: false, version: null };
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const valid = pkg.name === '@imyourboyroy/wcagate'
      && fs.existsSync(path.join(root, 'bin', 'wcagate.mjs'))
      && fs.existsSync(path.join(root, 'src', 'index.mjs'))
      && fs.existsSync(path.join(root, 'src', 'cli.mjs'));
    return { root, valid, version: pkg.version || null };
  } catch {
    return { root, valid: false, version: null };
  }
}

function inspectToolkit(portableRoot) {
  const rootResult = git(portableRoot, ['rev-parse', '--show-toplevel']);
  if (!rootResult.ok) {
    return { status: 'unmanaged', reason: 'Web_Toolkit is not inside a Git worktree.' };
  }

  const gitRoot = rootResult.stdout;
  const remoteResult = git(gitRoot, ['remote', 'get-url', 'origin']);
  if (!remoteResult.ok || !isExpectedToolkitRemote(remoteResult.stdout)) {
    return {
      status: 'skipped',
      reason: 'Git worktree origin is not the public Portable Web Toolkit repository.'
    };
  }

  const branchResult = git(gitRoot, ['branch', '--show-current']);
  const branch = branchResult.stdout || '(detached)';
  const dirtyResult = git(gitRoot, ['status', '--porcelain', '--untracked-files=all']);
  const dirty = dirtyResult.stdout.length > 0;
  const upstreamResult = git(gitRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const upstream = upstreamResult.ok ? upstreamResult.stdout : '';
  if (branch !== TOOLKIT_BRANCH || upstream !== `origin/${TOOLKIT_BRANCH}` || dirty) {
    return {
      status: 'skipped',
      branch,
      upstream: upstream || null,
      dirty,
      ahead: null,
      behind: null,
      head: git(gitRoot, ['rev-parse', '--short', 'HEAD']).stdout || null,
      reason: dirty
        ? 'Local toolkit changes are present; automatic update was not applied.'
        : `Checkout is not a clean tracking ${TOOLKIT_BRANCH} branch.`
    };
  }

  const fetchResult = git(gitRoot, ['fetch', '--quiet', '--no-tags', 'origin', TOOLKIT_BRANCH]);
  if (!fetchResult.ok) {
    return {
      status: 'error',
      branch,
      upstream,
      dirty,
      reason: `Could not check origin/${TOOLKIT_BRANCH}${lastLine(fetchResult.stderr || fetchResult.error) ? `: ${lastLine(fetchResult.stderr || fetchResult.error)}` : ''}`
    };
  }

  const relationResult = git(gitRoot, ['rev-list', '--left-right', '--count', `origin/${TOOLKIT_BRANCH}...HEAD`]);
  if (!relationResult.ok) {
    return {
      status: 'error',
      branch,
      upstream,
      dirty,
      reason: `Could not compare local ${TOOLKIT_BRANCH} with origin/${TOOLKIT_BRANCH}${lastLine(relationResult.stderr || relationResult.error) ? `: ${lastLine(relationResult.stderr || relationResult.error)}` : ''}`
    };
  }
  const counts = relationResult.stdout.split(/\s+/).map(Number);
  const behind = Number.isFinite(counts[0]) ? counts[0] : null;
  const ahead = Number.isFinite(counts[1]) ? counts[1] : null;
  const headBefore = git(gitRoot, ['rev-parse', '--short', 'HEAD']).stdout;

  if (ahead === null || behind === null) {
    return {
      status: 'error',
      branch,
      upstream,
      dirty,
      reason: 'Git returned an invalid toolkit history comparison.'
    };
  }
  if (ahead > 0) {
    return {
      status: 'skipped',
      branch,
      upstream,
      dirty,
      ahead,
      behind,
      head: headBefore || null,
      reason: 'Local toolkit history is not a fast-forward-only update.'
    };
  }
  if ((behind || 0) === 0) {
    return { status: 'current', branch, upstream, dirty, ahead, behind, head: headBefore || null };
  }

  const mergeResult = git(gitRoot, ['merge', '--ff-only', `origin/${TOOLKIT_BRANCH}`]);
  if (!mergeResult.ok) {
    return {
      status: 'error',
      branch,
      upstream,
      dirty,
      ahead,
      behind,
      head: headBefore || null,
      reason: `Fast-forward update failed${lastLine(mergeResult.stderr || mergeResult.error) ? `: ${lastLine(mergeResult.stderr || mergeResult.error)}` : ''}`
    };
  }
  const headAfter = git(gitRoot, ['rev-parse', '--short', 'HEAD']).stdout;
  return {
    status: 'updated',
    branch,
    upstream,
    dirty: false,
    ahead: 0,
    behind: 0,
    from: headBefore || null,
    head: headAfter || null,
    reason: `Fast-forwarded ${TOOLKIT_BRANCH} from origin; new source takes effect on the next invocation.`
  };
}

function remoteWcagRelease() {
  const result = run('git', ['ls-remote', '--tags', WCAGATE_REPOSITORY]);
  if (!result.ok) {
    return { ok: false, reason: `Could not check WCAGate releases${lastLine(result.stderr || result.error) ? `: ${lastLine(result.stderr || result.error)}` : ''}` };
  }
  const release = latestReleaseTag(result.stdout, WCAGATE_RANGE);
  return release
    ? { ok: true, ...release }
    : { ok: false, reason: `WCAGate has no release tag satisfying "${WCAGATE_RANGE}".` };
}

function updateWcagEngine(portableRoot, previous = {}) {
  const installed = validEngineRoot(portableRoot);
  const remote = remoteWcagRelease();
  if (!remote.ok) {
    return {
      status: 'error',
      installedVersion: installed.version,
      installed: installed.valid,
      remoteVersion: previous.remoteVersion || null,
      reason: remote.reason
    };
  }

  const installedParsed = parseVersion(installed.version);
  const upToDate = installed.valid && installedParsed && compareVersions(installedParsed, remote.version.split('.').map(Number)) >= 0;
  if (upToDate) {
    return {
      status: 'current',
      installedVersion: installed.version,
      installed: true,
      remoteVersion: remote.version
    };
  }

  const plan = engineInstallCommand({ refresh: true });
  const install = run(plan.command, plan.args, { cwd: portableRoot, timeout: 120_000 });
  const refreshed = validEngineRoot(portableRoot);
  if (!install.ok || !refreshed.valid) {
    return {
      status: 'error',
      installedVersion: refreshed.version || installed.version,
      installed: refreshed.valid,
      remoteVersion: previous.remoteVersion || null,
      targetVersion: remote.version,
      reason: `WCAGate update failed${lastLine(install.stderr || install.error) ? `: ${lastLine(install.stderr || install.error)}` : ` (exit ${install.status})`}`
    };
  }
  return {
    status: 'updated',
    installedVersion: refreshed.version,
    installed: true,
    remoteVersion: remote.version,
    reason: `Installed WCAGate ${refreshed.version} (latest release satisfying "${WCAGATE_RANGE}", ${remote.tag}).`
  };
}

function printReport(report) {
  const prefix = '[toolkit-auto-update]';
  if (report.status === 'throttled') return;
  console.error(`${prefix} checked; next check ${report.nextCheckAt}.`);
  for (const [name, result] of Object.entries({ toolkit: report.toolkit, wcagate: report.wcagate })) {
    if (!result) continue;
    const detail = result.reason ? ` — ${result.reason}` : '';
    console.error(`${prefix} ${name}: ${result.status}${detail}`);
  }
}

/**
 * Check and, when safe, update the toolkit and WCAGate.
 *
 * @param {{ portableRoot: string, force?: boolean, json?: boolean }} options
 */
export function maybeAutoUpdate({ portableRoot, force = false, json = false } = {}) {
  const rawRoot = String(portableRoot || '').trim();
  if (!rawRoot) return { status: 'disabled', reason: 'No portable toolkit root.' };
  const root = path.resolve(rawRoot);
  if (root === path.parse(root).root) return { status: 'disabled', reason: 'Portable toolkit root cannot be the filesystem root.' };
  if (!boolEnv('PORTABLE_TOOLKIT_AUTO_UPDATE', true)) return { status: 'disabled', reason: 'PORTABLE_TOOLKIT_AUTO_UPDATE is disabled.' };
  if (isTestProcess() && !boolEnv('PORTABLE_TOOLKIT_AUTO_UPDATE_IN_TESTS', false)) {
    return { status: 'disabled', reason: 'Automatic updates are disabled during Node tests.' };
  }

  const skippedFor = force ? '' : shouldSkipForInvocation();
  if (skippedFor) return { status: 'disabled', reason: `Skipped for ${skippedFor} invocation.` };

  const filePath = statePath(root);
  const previous = readState(filePath);
  const now = Date.now();
  const nextCheckAt = Date.parse(previous.nextCheckAt || '');
  if (!force && Number.isFinite(nextCheckAt) && now < nextCheckAt) {
    return { status: 'throttled', nextCheckAt: previous.nextCheckAt, previous };
  }

  const report = {
    schemaVersion: 1,
    status: 'checked',
    checkedAt: new Date(now).toISOString(),
    nextCheckAt: new Date(now + intervalMs()).toISOString(),
    toolkit: inspectToolkit(root),
    wcagate: updateWcagEngine(root, previous.wcagate || {})
  };
  const failed = [report.toolkit, report.wcagate].some((result) => result.status === 'error');
  if (failed) report.nextCheckAt = new Date(now + FAILURE_RETRY_MS).toISOString();
  writeState(filePath, report);
  if (json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  return report;
}

export const AUTO_UPDATE_DEFAULTS = Object.freeze({
  intervalMs: DEFAULT_INTERVAL_MS,
  failureRetryMs: FAILURE_RETRY_MS,
  toolkitBranch: TOOLKIT_BRANCH,
  wcagateSpec: WCAGATE_SPEC
});
