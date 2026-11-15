#!/usr/bin/env node
// ./Web_Toolkit/cloudflare-agent-toolkit/bin/cf-agent.mjs
/**
 * CLI entrypoint for the portable Cloudflare Agent Toolkit.
 *
 * Run via `node ./bin/cf-agent.mjs <command>` or `npm run start -- <command>`.
 * Commands cover wrangler setup/auth, token/zone audits, and zone hardening.
 */

import { parseCliArgs } from '../src/lib/cli.mjs';
import { PORTABLE_ROOT } from '../src/lib/paths.mjs';
import { enforceTemporarySession } from '../src/lib/wrangler.mjs';
import { loadSiteProfile } from '../src/lib/profile.mjs';
import { runDoctor } from '../src/commands/doctor.mjs';
import { runAuth } from '../src/commands/auth.mjs';
import { runWranglerCommand } from '../src/commands/wrangler.mjs';
import { runTokenAudit } from '../src/commands/token-audit.mjs';
import { runZoneAudit } from '../src/commands/zone-audit.mjs';
import { runZoneHarden } from '../src/commands/zone-harden.mjs';
import { runTestMinify } from '../src/commands/test-minify.mjs';
import { runFixPermissions } from '../src/commands/fix-permissions.mjs';
import { runAstroAnalyticsScaffold } from '../src/commands/scaffold-astro-analytics.mjs';
import { runPagesDomain } from '../src/commands/pages-domain.mjs';
import { runPerformanceAudit } from '../src/commands/performance-audit.mjs';
import { runSiteAudit } from '../src/commands/site-audit.mjs';
import { runSiteHarden } from '../src/commands/site-harden.mjs';
import { runDnsAudit } from '../src/commands/dns-audit.mjs';
import { runDnsFix } from '../src/commands/dns-fix.mjs';
import { runDnsPublicAudit } from '../src/commands/dns-public-audit.mjs';
import { runDeploy } from '../src/commands/deploy.mjs';
import { runDeploymentAudit } from '../src/commands/deployment-audit.mjs';
import { runDeployPages } from '../src/lib/deploy/pages.mjs';
import { runDeployWorkers } from '../src/lib/deploy/workers.mjs';
import { runCachePurge } from '../src/commands/cache-purge.mjs';
import { runWorkersVerify } from '../src/commands/workers-verify.mjs';
import { runEnvSync } from '../src/commands/env-sync.mjs';
import { runEmailAudit } from '../src/commands/email-audit.mjs';
import { runRulesAudit } from '../src/commands/rules-audit.mjs';
import { runRobotsAudit, runRobotsFix } from '../src/commands/robots-management.mjs';
import { runStack as runHeadersStack } from '../../headers_deploy/src/commands/stack.mjs';
import { runScaffoldPublic } from '../../headers_deploy/src/commands/scaffold-public.mjs';
import { runWriteDeploy } from '../../headers_deploy/src/commands/write-deploy.mjs';
import { runAudit as runHeadersAudit } from '../../headers_deploy/src/commands/audit.mjs';
import { printHelp as printStandardHelp } from '../../shared/lib/help.mjs';

function printHelp() {
  return printStandardHelp({
    name: 'cf-agent',
    summary: 'Portable Cloudflare automation assistant',
    usage: ['cf-agent <command> [subcommand] [--flags]'],
    commands: [
      { name: 'init', description: 'Explain the project-root .env workflow.' },
      { name: 'doctor [--json] [--offline] [--zone <name>]', description: 'Check local runtime and optional auth/token/zone connectivity.' },
      { name: 'wrangler <install|update|status|version> [--global]', description: 'Install/update Wrangler and inspect status.' },
      { name: 'auth <login|status|logout|wipe|token-guide> [--profile persistent|permanent|temporary] [--ttl 24h]', description: 'Manage Wrangler auth sessions and local credential cleanup.' },
      { name: 'permissions <audit|repair> --site-profile <path> [--apply]', description: 'Audit or repair API token permissions using the site profile.' },
      { name: 'site <audit|harden> --site-profile <path> [--apply]', description: 'Audit or harden the site using its profile.' },
      { name: 'dns <audit|fix|public> --site-profile <path> [--apply] [--create-missing]', description: 'Audit DNS, inspect public resolver views, or apply DNS fixes.' },
      { name: 'deploy <dev|prod|pages|workers> --site-profile <path> [--apply]', description: 'Verify setup, then preview or apply a profile/Pages/Workers deployment.' },
      { name: 'deployment audit', description: 'Audit account-level Pages, Worker, and URL state.' },
      { name: 'cache purge', description: 'Preview or apply a cache purge for the active site profile.' },
      { name: 'workers verify', description: 'Verify expected Worker routes from the site profile.' },
      { name: 'rules audit', description: 'Audit redirect/cache/header/origin/WAF rule coverage.' },
      { name: 'performance audit', description: 'Emit JSON findings for Cloudflare performance switches and config rules.' },
      { name: 'email audit', description: 'Audit MX/SPF/DMARC/DKIM and provider hints.' },
      { name: 'robots <audit|fix>', description: 'Audit or fix managed robots.txt/content-signal posture.' },
      { name: 'headers <stack|scaffold-public|write-deploy|audit> [--site-profile <path>] [--project-root <path>] [--environment production|development] [--apply]', description: 'Manage the Pages _headers baseline and deploy merge.' },
      { name: 'env sync', description: 'Legacy no-op; project-root .env is read directly.' },
      { name: 'audit token|zone', description: 'Legacy aliases for permission and zone audits.' },
      { name: 'harden zone [--zone <name>] [--hosts <list>] [--dry-run] [--apply] [--output-dir <dir>]', description: 'Legacy zone hardening; dry-run unless --apply.' },
      { name: 'test minify', description: 'Smoke-test origin HTML/CSS/JS minification.' },
      { name: 'scaffold astro-analytics [--project-root <dir>] [--ga4-id <id>] [--posthog-key <key>] [--apply]', description: 'Preview or apply Astro analytics, CSP, and env scaffolding.' },
      { name: 'pages list|domains|add-domain|setup [--zone <name>] [--project <name>] [--apply]', description: 'Inspect Pages projects/domains or preview/apply domain changes.' }
    ],
    flags: [
      { name: '--site-profile <path>', description: 'Select target site configuration for site-scoped commands.' },
      { name: '--project-root <path>', description: 'Select target project root for local file operations.' },
      { name: '--apply', description: 'Apply mutations; commands that support changes preview by default.' },
      { name: '--json', description: 'Emit JSON where supported (doctor and performance audit).' },
      { name: '--offline', description: 'Keep doctor checks local; do not probe remote services.' },
      { name: '--create-missing', description: 'Allow DNS fix to create missing records when combined with --apply.' },
      { name: '--cleanup-dns', description: 'Allow Pages setup to remove stale DNS records when combined with --apply.' },
      { name: '--force', description: 'Allow documented overwrite behavior for supported scaffolds.' },
      { name: '--dry-run', description: 'Force preview mode for zone hardening.' },
      { name: '--zone <name>', description: 'Select a Cloudflare zone when a command does not use a site profile.' },
      { name: '--hosts <list>', description: 'Supply comma-separated hosts for zone-scoped checks.' },
      { name: '--output-dir <path>', description: 'Override the directory for supported audit reports.' }
    ],
    examples: [
      'cf-agent doctor --json --offline',
      'cf-agent permissions audit --site-profile ../site-profiles/example-workers.json',
      'cf-agent site harden --site-profile ../site-profiles/example-workers.json',
      'cf-agent deploy dev --site-profile ../site-profiles/example-workers.json',
      'cf-agent pages setup --domains www.example.com,example.com --project my-site'
    ],
    notes: [
      'Read-only audits do not need --apply; supported mutations preview first and require --apply.',
      'DNS record creation additionally requires --create-missing. Pages setup DNS cleanup requires --cleanup-dns.',
      'Production deploys are consequential: inspect the preview and obtain authorization before applying.',
      'Site-scoped commands read secrets from the target project .env and shell environment; never put secret values in profiles or reports.'
    ],
    exitCodes: [
      { name: '0', description: 'Command completed successfully.' },
      { name: '1', description: 'Usage, configuration, or unhandled command failure.' },
      { name: '2', description: 'An audit/gate reported failed checks (command dependent).' }
    ]
  });
}

function ensureEnvTemplate() {
  console.log(`Project root .env is the preferred source of truth for live site settings.`);
  console.log(`Optional machine-level defaults can still live in ${PORTABLE_ROOT}\\.env, but no toolkit-local sync file is required.`);
  return 0;
}
async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const [primary = 'help', secondary = ''] = command.map((entry) => String(entry).toLowerCase());
  const site = ['permissions', 'site', 'dns', 'deploy', 'workers', 'rules', 'performance', 'email', 'robots'].includes(primary) || (primary === 'cache' && secondary === 'purge')
    ? loadSiteProfile(flags)
    : null;

  if (primary === 'help' || primary === '--help' || primary === '-h') {
    printHelp();
    return 0;
  }

  if (primary === 'init') {
    return ensureEnvTemplate();
  }

  if (primary === 'doctor') {
    enforceTemporarySession();
    return runDoctor(site ? { ...flags, zone: site.zoneName } : flags);
  }

  if (primary === 'wrangler') {
    return runWranglerCommand(secondary || 'version', flags);
  }

  if (primary === 'auth') {
    return runAuth(secondary || 'status', flags);
  }

  if (primary === 'permissions' && secondary === 'audit') {
    enforceTemporarySession();
    return runTokenAudit({ ...flags, zone: site.zoneName });
  }

  if (primary === 'permissions' && secondary === 'repair') {
    enforceTemporarySession();
    return runFixPermissions({ ...flags, zone: site.zoneName });
  }

  if (primary === 'site' && secondary === 'audit') {
    enforceTemporarySession();
    return runSiteAudit(flags);
  }

  if (primary === 'site' && secondary === 'harden') {
    enforceTemporarySession();
    return runSiteHarden(flags);
  }

  if (primary === 'dns' && secondary === 'audit') {
    enforceTemporarySession();
    return runDnsAudit(flags);
  }

  if (primary === 'dns' && secondary === 'fix') {
    enforceTemporarySession();
    return runDnsFix(flags);
  }

  if (primary === 'dns' && secondary === 'public') {
    enforceTemporarySession();
    return runDnsPublicAudit(flags);
  }

  if (primary === 'deploy' && secondary === 'pages') {
    enforceTemporarySession();
    return runDeployPages(flags);
  }

  if (primary === 'deploy' && secondary === 'workers') {
    enforceTemporarySession();
    return runDeployWorkers(flags);
  }

  if (primary === 'deploy' && ['dev', 'prod', 'development', 'production'].includes(secondary)) {
    enforceTemporarySession();
    return runDeploy(secondary, flags);
  }

  if (primary === 'deployment' && secondary === 'audit') {
    enforceTemporarySession();
    return runDeploymentAudit(flags);
  }

  if (primary === 'cache' && secondary === 'purge') {
    enforceTemporarySession();
    return runCachePurge(flags);
  }

  if (primary === 'workers' && secondary === 'verify') {
    enforceTemporarySession();
    return runWorkersVerify(flags);
  }

  if (primary === 'rules' && secondary === 'audit') {
    enforceTemporarySession();
    return runRulesAudit(flags);
  }

  if (primary === 'performance' && secondary === 'audit') {
    enforceTemporarySession();
    return runPerformanceAudit(flags);
  }

  if (primary === 'email' && secondary === 'audit') {
    enforceTemporarySession();
    return runEmailAudit(flags);
  }

  if (primary === 'robots' && secondary === 'audit') {
    enforceTemporarySession();
    return runRobotsAudit(flags);
  }

  if (primary === 'robots' && secondary === 'fix') {
    enforceTemporarySession();
    return runRobotsFix(flags);
  }

  if (primary === 'env' && secondary === 'sync') {
    return runEnvSync(flags);
  }

  if (primary === 'audit' && secondary === 'token') {
    enforceTemporarySession();
    return runTokenAudit(site ? { ...flags, zone: site.zoneName } : flags);
  }

  if (primary === 'audit' && secondary === 'zone') {
    enforceTemporarySession();
    return runZoneAudit(flags);
  }

  if (primary === 'harden' && secondary === 'zone') {
    enforceTemporarySession();
    return runZoneHarden(flags);
  }

  if (primary === 'test' && secondary === 'minify') {
    return runTestMinify(flags);
  }

  if (primary === 'scaffold' && secondary === 'astro-analytics') {
    return runAstroAnalyticsScaffold(flags);
  }

  if (primary === 'pages') {
    enforceTemporarySession();
    return runPagesDomain(secondary || 'list', flags);
  }

  if (primary === 'headers') {
    if (secondary === 'stack') return runHeadersStack(flags);
    if (secondary === 'scaffold-public') return runScaffoldPublic(flags);
    if (secondary === 'write-deploy') return runWriteDeploy(flags);
    if (secondary === 'audit') return runHeadersAudit(flags);
  }

  console.error(`Unknown command: ${[primary, secondary].filter(Boolean).join(' ')}`);
  console.error('Run `cf-agent help` for usage.');
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error('\n[cf-agent] failed');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });


