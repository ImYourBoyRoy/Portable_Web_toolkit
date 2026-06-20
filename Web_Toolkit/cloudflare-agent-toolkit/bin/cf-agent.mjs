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
import { toBool } from '../src/lib/format.mjs';
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

function printHelp() {
  console.log(`
cf-agent — Portable Cloudflare automation assistant

Usage:
  cf-agent <command> [subcommand] [--flags]

Commands:
  init
      Explain the preferred single-.env workflow (project root .env first).

  doctor [--json] [--offline] [--zone <name>]
      Check local runtime + optional auth/token/zone connectivity.

  wrangler <install|update|status|version> [--global]
      Install/update Wrangler and inspect status.

  auth <login|status|logout|wipe|token-guide> [--profile persistent|permanent|temporary] [--ttl 24h]
      Manage wrangler auth sessions and local credential cleanup.

  permissions <audit|repair> [--site-profile <path>] [--apply]
      Audit or self-repair API token permissions using the active site profile.

  site <audit|harden> [--site-profile <path>] [--apply]
      Combined site audit or baseline hardening using the active site profile.

  dns <audit|fix> [--site-profile <path>] [--apply] [--create-missing]
      Audit DNS expectations or apply low-risk proxied-state fixes. Missing records require --create-missing with --apply.

  dns public [--site-profile <path>]
      Compare Cloudflare DNS records to public/local resolver views.

  deploy <dev|prod|pages|workers> [--site-profile <path>] [--apply]
      Run setup verification, then deploy (profile command, Pages, or Workers).

  deployment audit [--site-profile <path>]
      Account-level Pages/Worker/URL audit (no production zone required).

  cache purge [--site-profile <path>] [--apply]
      Run the portable Astro cache purge helper for the active site profile.

  workers verify [--site-profile <path>]
      Verify expected Cloudflare worker routes from the site profile.

  rules audit [--site-profile <path>]
      Audit redirect/cache/header/origin/WAF rule coverage for the site.

  performance audit [--site-profile <path>]
      AI-agent JSON-only audit of Cloudflare performance switches and config rules.

  email audit [--site-profile <path>]
      Audit email-related DNS posture (MX/SPF/DMARC/DKIM/provider hints).

  robots <audit|fix> [--site-profile <path>] [--apply]
      Audit or fix Cloudflare managed robots.txt/content-signal posture.

  env sync
      Legacy no-op. The toolkit now reads the target project root .env directly.

  audit token [--zone <name>] [--output-dir <dir>]
      Legacy alias for permissions audit.

  audit zone [--zone <name>] [--hosts a.com,b.com] [--output-dir <dir>]
      Legacy alias for zone-only audit.

  harden zone [--zone <name>] [--dry-run] [--apply] [--hosts a.com,b.com] [--output-dir <dir>]
      Legacy alias for zone-only hardening. Dry-run is the default unless --apply is passed.

  test minify [--zone <name>] [--hosts a.com,b.com] [--output-dir <dir>]
      Smoke-test whether origin HTML/CSS/JS assets are minified.

  scaffold astro-analytics [--project-root <dir>] [--ga4-id G-XXXX] [--posthog-key phc_xxx]
      Create/patch Astro analytics files (ga4.astro, posthog.astro, CSP middleware, env keys).
      Optional: --dry-run --force --layout-path src/layouts/BaseLayout.astro --write-env false

  pages list [--zone <name>]
      List all Pages projects in the account.

  pages domains [--project <name>] [--zone <name>]
      List custom domains attached to a Pages project.

  pages add-domain --domain <d> [--project <name>] [--zone <name>]
      Add a single custom domain to a project.

  pages setup [--domains d1,d2] [--project <name>] [--zone <name>] [--cleanup-dns] [--dry-run]
      Add configured custom domains + optionally remove stale Squarespace DNS records.

Examples:
  npm run start -- doctor
  npm run start -- auth login --profile temporary --ttl 12h
  npm run start -- permissions audit --site-profile ../site-profiles/example-workers.json
  npm run start -- site audit --site-profile ../site-profiles/example-workers.json
  npm run start -- dns audit --site-profile ../site-profiles/example-workers.json
  npm run start -- site harden --site-profile ../site-profiles/example-workers.json
  npm run start -- deploy dev --site-profile ../site-profiles/example-workers.json
  npm run start -- cache purge --site-profile ../site-profiles/example-workers.json
  npm run start -- dns public --site-profile ../site-profiles/example-workers.json
  npm run start -- rules audit --site-profile ../site-profiles/example-workers.json
  npm run start -- performance audit --site-profile ../site-profiles/example-workers.json
  npm run start -- email audit --site-profile ../site-profiles/example-workers.json
  npm run start -- robots audit --site-profile ../site-profiles/example-workers.json
  npm run start -- robots fix --site-profile ../site-profiles/example-workers.json --apply
  npm run start -- workers verify --site-profile ../site-profiles/example-workers.json
  npm run start -- test minify --zone example.com
  npm run start -- scaffold astro-analytics --project-root C:/sites/app --ga4-id G-XXXX --posthog-key phc_xxx
  npm run start -- pages list
  npm run start -- pages setup --dry-run
  npm run start -- pages setup --cleanup-dns
  npm run start -- env sync
`.trim());
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
    return runFixPermissions({ ...flags, zone: site.zoneName, 'dry-run': !toBool(flags.apply, false) });
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


