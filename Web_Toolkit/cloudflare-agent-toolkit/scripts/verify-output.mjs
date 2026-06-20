// ./Web_Toolkit/cloudflare-agent-toolkit/scripts/verify-output.mjs
/**
 * Deterministic verification script for README "Verified Outputs".
 *
 * Runs lightweight checks (no network writes) so users can quickly confirm
 * toolkit wiring after copy/paste into a new environment.
 */

import { runCommand } from '../src/lib/exec.mjs';
import { parseDurationMs } from '../src/lib/env.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const help = runCommand('node', ['./bin/cf-agent.mjs', 'help'], { throwOnError: false });
  assert(help.status === 0, 'help command failed');
  assert(help.stdout.includes('cf-agent — Portable Cloudflare automation assistant'), 'help output missing banner');
  console.log('[verify] pass: help command reachable');

  assert(parseDurationMs('24h', 0) === 86_400_000, 'duration parser failed for 24h');
  assert(parseDurationMs('90m', 0) === 5_400_000, 'duration parser failed for 90m');
  console.log('[verify] pass: duration parser');

  const jsonDoctor = runCommand('node', ['./bin/cf-agent.mjs', 'doctor', '--offline', '--json'], { throwOnError: false });
  assert(jsonDoctor.status === 0 || jsonDoctor.status === 2, 'doctor command unexpected exit code');
  assert(jsonDoctor.stdout.includes('"runtime"'), 'doctor json output missing runtime section');
  console.log('[verify] pass: offline doctor JSON output');

  assert(help.stdout.includes('permissions <audit|repair>'), 'help output missing permissions commands');
  assert(help.stdout.includes('site <audit|harden>'), 'help output missing site commands');
  console.log('[verify] pass: profile-driven audit commands reachable');

  assert(help.stdout.includes('pages list'), 'help output missing pages list command');
  assert(help.stdout.includes('pages setup'), 'help output missing pages setup command');
  console.log('[verify] pass: pages commands reachable');

  assert(help.stdout.includes('cache purge'), 'help output missing cache purge command');
  assert(help.stdout.includes('workers verify'), 'help output missing workers verify command');
  console.log('[verify] pass: cache/workers commands reachable');

  assert(help.stdout.includes('dns public'), 'help output missing public DNS command');
  assert(help.stdout.includes('rules audit'), 'help output missing rules audit command');
  assert(help.stdout.includes('email audit'), 'help output missing email audit command');
  assert(help.stdout.includes('robots <audit|fix>'), 'help output missing robots command');
  console.log('[verify] pass: expanded DNS/rules/email/robots commands reachable');

  console.log('[verify] all checks passed');
}

try {
  main();
} catch (error) {
  console.error('[verify] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

