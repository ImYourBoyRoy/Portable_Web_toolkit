// ./Web_Toolkit/shared/lib/auto-update.mjs
/**
 * Throttled, fail-open freshness preflight for the portable toolkit.
 *
 * The preflight may update two independent resources:
 *   1. this toolkit, but only from a clean public-repository main branch that
 *      can fast-forward to origin/main;
 *   2. WCAGate, from the public GitHub main branch, installed into the
 *      toolkit's ignored node_modules directory.
 *
 * It never overwrites dirty work, feature branches, unmanaged repositories, or
 * exported toolkit folders. Runtime state is intentionally kept under
 * Web_Toolkit/.runtime/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const TOOLKIT_REPOSITORY = 'github.com/imyourboyroy/portable_web_toolkit';
const TOOLKIT_BRANCH = 'main';
const WCAGATE_REPOSITORY = 'https://github.com/imyourboyroy/WCAGate.git';
const WCAGATE_SPEC = 'github:imyourboyroy/WCAGate';
const STATE_FILE = path.join('.runtime', 'toolkit-auto-update.json');
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 60 * 1000;
const TEST_ARGUMENTS = new Set(['--test', '--test-only', '--experimental-test-coverage']);

function boolEnv(name, fallback) {
  const value = String(process.env[name] || '').trim().toLowerCase();
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

function commandName(name) {
  return process.platform === 'win32' && name === 'npm' ? 'npm.cmd' : name;
}

function run(command, args, options = {}) {
  const result = spawnSync(commandName(command), args, {
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

function remoteWcagHead() {
  const result = run('git', ['ls-remote', '--heads', WCAGATE_REPOSITORY, 'main']);
  if (!result.ok) {
    return { ok: false, reason: `Could not check WCAGate main${lastLine(result.stderr || result.error) ? `: ${lastLine(result.stderr || result.error)}` : ''}` };
  }
  const head = result.stdout.split(/\s+/)[0] || '';
  return head ? { ok: true, head } : { ok: false, reason: 'WCAGate main returned no commit.' };
}

function updateWcagEngine(portableRoot, previous = {}) {
  const installed = validEngineRoot(portableRoot);
  const remote = remoteWcagHead();
  if (!remote.ok) {
    return {
      status: 'error',
      installedVersion: installed.version,
      installed: installed.valid,
      remoteHead: previous.remoteHead || null,
      reason: remote.reason
    };
  }

  if (installed.valid && previous.remoteHead === remote.head) {
    return {
      status: 'current',
      installedVersion: installed.version,
      installed: true,
      remoteHead: remote.head
    };
  }

  const install = run('npm', [
    'install',
    WCAGATE_SPEC,
    '--allow-git=all',
    '--no-audit',
    '--no-fund',
    '--package-lock=false'
  ], { cwd: portableRoot, timeout: 120_000 });
  const refreshed = validEngineRoot(portableRoot);
  if (!install.ok || !refreshed.valid) {
    return {
      status: 'error',
      installedVersion: refreshed.version || installed.version,
      installed: refreshed.valid,
      remoteHead: previous.remoteHead || null,
      targetHead: remote.head,
      reason: `WCAGate update failed${lastLine(install.stderr || install.error) ? `: ${lastLine(install.stderr || install.error)}` : ` (exit ${install.status})`}`
    };
  }
  return {
    status: 'updated',
    installedVersion: refreshed.version,
    installed: true,
    remoteHead: remote.head,
    reason: previous.remoteHead ? 'WCAGate main changed; installed the current GitHub head.' : 'Installed the current WCAGate GitHub head.'
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
