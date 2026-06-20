#!/usr/bin/env node
// ./Web_Toolkit/Setup_astro_environment/bin/astro-env-setup.mjs
/**
 * CLI entrypoint for the portable Astro environment setup tool.
 *
 * Run via `node ./bin/astro-env-setup.mjs <command>`.
 * Commands validate, repair, and verify Astro/Vite/Cloudflare project setup.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { runDoctor, runFix, runPrepareProject, runPreview, runVerify } from '../src/commands/setup.mjs';
import { runPreviewSmoke } from '../src/commands/preview-smoke.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'astro-env-setup',
    summary: 'Portable Astro/Vite/Cloudflare environment setup',
    usage: [
      'astro-env-setup doctor --project-root <path> --site-profile <profile> [--json]',
      'astro-env-setup fix --project-root <path> --site-profile <profile>',
      'astro-env-setup verify --project-root <path> --site-profile <profile>',
      'astro-env-setup prepare-project --project-root <path> --site-profile <profile>',
      'astro-env-setup preview --project-root <path> --site-profile <profile> [--command "<preview cmd>"]',
      'astro-env-setup preview-smoke --project-root <path> --site-profile <profile>'
    ],
    commands: [
      { name: 'doctor', description: 'Inspect package manager, Astro/Vite/Wrangler files, env examples, dependency state, and deploy-script readiness.' },
      { name: 'fix', description: 'Install dependencies and apply safe project-level repairs before local validation.' },
      { name: 'verify', description: 'Run the configured check/build/tests flow for the target Astro project.' },
      { name: 'prepare-project', description: 'Run fix first, then verify, as the safest pre-deploy bootstrap.' },
      { name: 'preview', description: 'Start a local preview or dev server so the user or model can browse before publish.' },
      { name: 'preview-smoke', description: 'Launch preview automatically, probe it, and stop it again for a machine-verifiable local smoke pass.' }
    ],
    flags: [
      { name: '--project-root <path>', description: 'Target Astro/Vite project root. Defaults to the active site profile projectRoot.' },
      { name: '--site-profile <path>', description: 'Portable site profile JSON used for hosts, commands, diagnostics, and Cloudflare conventions.' },
      { name: '--skip-install', description: 'Skip dependency installation during fix/prepare-project.' },
      { name: '--skip-tests', description: 'Skip the configured test command list during verify/prepare-project.' },
      { name: '--command <preview cmd>', description: 'Override the preview command when the project uses a custom local browsing workflow.' },
      { name: '--host <host>', description: 'Preview host override. Defaults to 127.0.0.1.' },
      { name: '--port <port>', description: 'Preview port override. Defaults to the project or tool fallback.' },
      { name: '--timeout-ms <ms>', description: 'Override preview-smoke startup timeout.' },
      { name: '--json', description: 'Emit machine-readable JSON for doctor output.' }
    ],
    examples: [
      'astro-env-setup doctor --project-root C:/sites/client-app --site-profile ../../site-profiles/client.json',
      'astro-env-setup preview --project-root C:/sites/client-app --site-profile ../../site-profiles/client.json',
      'astro-env-setup preview-smoke --project-root C:/sites/client-app --site-profile ../../site-profiles/client.json'
    ],
    notes: [
      'Preview prefers a preview script and falls back to dev when adapters such as @astrojs/cloudflare do not support astro preview.',
      'Live site secrets should live in the project root .env, not inside the portable toolkit.'
    ],
    exitCodes: [
      { name: '0', description: 'Healthy or successfully repaired.' },
      { name: '2', description: 'Warnings remain, such as non-blocking drift or skipped checks.' },
      { name: '1', description: 'Unhandled failure.' }
    ]
  });
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const primary = String(command[0] || 'help').toLowerCase();
  if (['help', '--help', '-h'].includes(primary)) {
    printHelp();
    return 0;
  }
  if (primary === 'doctor') return runDoctor(flags);
  if (primary === 'fix') return runFix(flags);
  if (primary === 'verify') return runVerify(flags);
  if (primary === 'prepare-project') return runPrepareProject(flags);
  if (primary === 'preview') return runPreview(flags);
  if (primary === 'preview-smoke') return runPreviewSmoke(flags);
  console.error(`Unknown command: ${primary}`);
  printHelp();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error('\n[astro-env-setup] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

