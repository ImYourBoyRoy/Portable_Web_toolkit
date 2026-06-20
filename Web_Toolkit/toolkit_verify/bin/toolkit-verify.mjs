#!/usr/bin/env node
// ./Web_Toolkit/toolkit_verify/bin/toolkit-verify.mjs
/**
 * Runs a lightweight portable-toolkit self-verification pass.
 *
 * By default this checks core CLI entrypoints plus sanitized export/privacy
 * behavior. With `--cloudflare`, it also runs live read-only Cloudflare audits
 * for the supplied site profile using the target project's root .env.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';
import { resolvePortableRoot, resolveRuntimePath } from '../../shared/lib/context.mjs';

const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 2);

function parseArgs(argv) {
  const command = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      command.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function printHelp() {
  return printStandardHelp({
    name: 'toolkit-verify',
    summary: 'Portable toolkit self-verification helper',
    usage: [
      'toolkit-verify [--site-profile <profile>] [--project-root <path>] [--cloudflare]'
    ],
    commands: [
      { name: 'default', description: 'Verify core CLI entrypoints plus sanitized export/privacy behavior.' }
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Optional site profile for project-aware checks.' },
      { name: '--project-root <path>', description: 'Optional project root override.' },
      { name: '--cloudflare', description: 'Also run live Cloudflare read-only audits using the resolved project root .env.' }
    ],
    examples: [
      'toolkit-verify',
      'toolkit-verify --site-profile Web_Toolkit/site-profiles/example-workers.json --project-root . --cloudflare'
    ],
    notes: [
      'This is a non-mutating verification command.',
      'Cloudflare mode uses the target project root .env plus shell env as available.'
    ],
    exitCodes: [
      { name: '0', description: 'All checks passed.' },
      { name: '2', description: 'One or more checks warned/failed.' },
      { name: '1', description: 'Unhandled failure.' }
    ]
  });
}

function runNode(args = [], options = {}) {
  return spawnSync('node', args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

function quotedArgs(flags = {}) {
  const args = [];
  if (flags['site-profile']) args.push('--site-profile', String(flags['site-profile']));
  if (flags['project-root']) args.push('--project-root', String(flags['project-root']));
  return args;
}

function toolkitScript(relativePath) {
  return path.join(PORTABLE_ROOT, relativePath);
}

function verifySteps(flags = {}, exportRoot) {
  const shared = quotedArgs(flags);
  const steps = [
    {
      name: 'cf-agent help',
      args: [toolkitScript('cloudflare-agent-toolkit/bin/cf-agent.mjs'), 'help']
    },
    {
      name: 'cf-agent init',
      args: [toolkitScript('cloudflare-agent-toolkit/bin/cf-agent.mjs'), 'init']
    },
    {
      name: 'cf-agent env sync',
      args: [toolkitScript('cloudflare-agent-toolkit/bin/cf-agent.mjs'), 'env', 'sync']
    },
    {
      name: 'site-doctor help',
      args: [toolkitScript('site_doctor/bin/site-doctor.mjs'), 'help']
    },
    {
      name: 'export portable toolkit',
      args: [toolkitScript('scripts/export-portable-toolkit.mjs'), '--to', exportRoot]
    },
    {
      name: 'privacy-check export',
      args: [toolkitScript('privacy_check/bin/privacy-check.mjs'), 'scan', '--root', exportRoot, '--json']
    }
  ];

  if (shared.length > 0) {
    const projectRoot = flags['project-root'] ? path.resolve(String(flags['project-root'])) : process.cwd();
    steps.splice(3, 0,
      {
        name: 'astro-env-setup doctor',
        args: [toolkitScript('Setup_astro_environment/bin/astro-env-setup.mjs'), 'doctor', ...shared, '--json']
      },
      {
        name: 'cache-purge dry-run',
        args: [toolkitScript('cache_purge/bin/cache-purge.mjs'), ...shared]
      },
      {
        name: 'stylesheet-check',
        args: [toolkitScript('stylesheet_check/bin/stylesheet-check.mjs'), 'scan', '--root', projectRoot, '--json']
      }
    );
  }

  if (String(flags.cloudflare || 'false').toLowerCase() === 'true') {
    if (shared.length === 0) {
      throw new Error('--cloudflare requires --site-profile.');
    }
    steps.push(
      {
        name: 'cf-agent permissions audit',
        args: [toolkitScript('cloudflare-agent-toolkit/bin/cf-agent.mjs'), 'permissions', 'audit', ...shared]
      },
      {
        name: 'cf-agent site audit',
        args: [toolkitScript('cloudflare-agent-toolkit/bin/cf-agent.mjs'), 'site', 'audit', ...shared]
      },
      {
        name: 'cf-agent workers verify',
        args: [toolkitScript('cloudflare-agent-toolkit/bin/cf-agent.mjs'), 'workers', 'verify', ...shared]
      }
    );
  }

  return steps;
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const primary = String(command[0] || '').toLowerCase();
  if (['help', '--help', '-h'].includes(primary) || flags.help) {
    printHelp();
    return 0;
  }

  const exportRoot = resolveRuntimePath(PORTABLE_ROOT, 'verify', 'portable-toolkit-export');
  if (fs.existsSync(exportRoot)) {
    fs.rmSync(exportRoot, { recursive: true, force: true });
  }

  const steps = verifySteps(flags, exportRoot);
  const results = [];
  for (const step of steps) {
    const result = runNode(step.args, { cwd: PORTABLE_ROOT });
    results.push({
      name: step.name,
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    });
  }

  let worst = 0;
  console.log('\nPortable toolkit self-verify');
  for (const result of results) {
    const ok = result.status === 0;
    if (!ok) worst = 2;
    console.log(`- ${result.name}: ${ok ? 'PASS' : `FAIL (${result.status})`}`);
  }

  const reportPath = resolveRuntimePath(PORTABLE_ROOT, 'verify', 'toolkit-verify-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)}\n`, 'utf8');
  console.log(`- Report: ${reportPath}`);
  return worst;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error('\n[toolkit-verify] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

