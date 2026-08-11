// ./Web_Toolkit/init_site_profile/src/lib/template.mjs
/**
 * Template helpers for portable site profile generation.
 *
 * Client profiles default to `<project-root>/<site-id>.site-profile.json`
 * with `projectRoot: "."`. Do not write live client profiles into the
 * toolkit's `site-profiles/` folder (examples only).
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolvePortableRoot } from '../../../shared/lib/context.mjs';

const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);
const SCHEMA_PATH = path.join(PORTABLE_ROOT, 'site-profile.schema.json');

function csvList(value) {
  return String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeRelative(fromDir, targetPath) {
  const relative = path.relative(fromDir, targetPath).replace(/\\/g, '/');
  return relative || '.';
}

/** Required create flags (CLI will refuse without these). */
export function requiredCreateFlags() {
  return [
    { flag: '--site-id <id>', field: 'siteId', why: 'Stable short id used in filenames and reports' },
    { flag: '--project-root <path>', field: 'projectRoot', why: 'Client site folder (profile is written here by default)' },
    { flag: '--deploy-target <workers|pages>', field: 'deployTarget', why: 'Primary Cloudflare deploy style' },
    { flag: '--zone <name>', field: 'zone', why: 'Cloudflare zone / apex domain' },
    { flag: '--prod-hosts <csv>', field: 'prodHosts', why: 'Production hostnames (usually apex + www)' }
  ];
}

/** Optional interview fields — ask when unknown; safe defaults exist for many. */
export function optionalInterviewFields() {
  return [
    { flag: '--dev-hosts <csv>', field: 'devHosts', why: 'Staging/dev hostnames' },
    { flag: '--registrar <name>', field: 'registrar', why: 'Current domain registrar (any; Porkbun is one optional toolkit example)' },
    { flag: '--dns-provider <name>', field: 'dnsProvider', why: 'Who hosts DNS today (often cloudflare)' },
    { flag: '--email-enabled <true|false>', field: 'emailEnabled', why: 'Whether the domain receives email' },
    { flag: '--email-provider <name>', field: 'emailProvider', why: 'Mailbox provider if email is active' },
    { flag: '--account-id <id>', field: 'accountId', why: 'Cloudflare account id (agent can look up after API token)' },
    { flag: '--account-name <name>', field: 'accountName', why: 'Human Cloudflare account label' },
    { flag: '--worker-prod <name>', field: 'workerProd', why: 'Workers production script name (default: <siteId>-app)' },
    { flag: '--worker-dev <name>', field: 'workerDev', why: 'Workers development script name' },
    { flag: '--pages-project <name>', field: 'pagesProject', why: 'Pages project name (default: <siteId>)' },
    { flag: '--install <cmd>', field: 'install', why: 'Default: npm install' },
    { flag: '--check <cmd>', field: 'check', why: 'Default: npm run check' },
    { flag: '--build <cmd>', field: 'build', why: 'Default: npm run build' },
    { flag: '--preview <cmd>', field: 'preview', why: 'Default: npm run preview' },
    { flag: '--tests <csv>', field: 'tests', why: 'Optional test command list' },
    { flag: '--deploy-dev <cmd>', field: 'deployDev', why: 'Staging deploy command' },
    { flag: '--deploy-prod <cmd>', field: 'deployProd', why: 'Production deploy command' },
    { flag: '--output <path>', field: 'output', why: 'Override output path (default: <project-root>/<site-id>.site-profile.json)' },
    { flag: '--expected-nameservers <csv>', field: 'expectedNameservers', why: 'Expected NS set when known' },
    { flag: '--notes <csv>', field: 'notes', why: 'Freeform operator notes' }
  ];
}

export function requiredQuestions() {
  return [
    ...requiredCreateFlags().map((entry) => `${entry.field} (${entry.flag}) — ${entry.why}`),
    ...optionalInterviewFields().map((entry) => `${entry.field} optional (${entry.flag}) — ${entry.why}`)
  ];
}

export function requirementsPayload() {
  return {
    defaultOutput: '<project-root>/<site-id>.site-profile.json',
    projectRootInProfile: '.',
    note: 'Write live client profiles into the client project. Toolkit site-profiles/ is for public examples only.',
    requiredCreateFlags: requiredCreateFlags(),
    optionalInterviewFields: optionalInterviewFields(),
    agentProtocol: [
      'Run init-site-profile requirements (or requirements --json).',
      'Interview the user; propose siteId, worker/pages names, and hosts from the domain — do not ask them to invent opaque names alone.',
      'Create with all required flags. Prefer default output in the client project.',
      'Pass --site-profile <that file> to readiness, cf-agent, and other toolkit CLIs.',
      'Keep secrets in project .env (never in the profile JSON).'
    ]
  };
}

export function missingFields(flags = {}) {
  const required = [
    ['site-id', 'siteId'],
    ['project-root', 'projectRoot'],
    ['deploy-target', 'deployTarget'],
    ['zone', 'zone'],
    ['prod-hosts', 'prodHosts']
  ];
  return required.filter(([key]) => !String(flags[key] || '').trim()).map(([, label]) => label);
}

export function validateCreateFlags(flags = {}) {
  const errors = [];
  const missing = missingFields(flags);
  for (const label of missing) errors.push(`Missing required field: ${label}`);

  const deployTarget = String(flags['deploy-target'] || '').trim().toLowerCase();
  if (deployTarget && !['workers', 'pages'].includes(deployTarget)) {
    errors.push(`deployTarget must be workers or pages (got: ${deployTarget})`);
  }

  const siteId = String(flags['site-id'] || '').trim();
  if (siteId && !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(siteId)) {
    errors.push('siteId must be a short filesystem-safe id (letters, numbers, . _ -)');
  }

  return errors;
}

export function resolveOutputPath(flags = {}) {
  if (flags.output) return path.resolve(String(flags.output));
  const siteId = String(flags['site-id'] || '').trim();
  const projectRoot = path.resolve(String(flags['project-root'] || '').trim() || process.cwd());
  return path.join(projectRoot, `${siteId}.site-profile.json`);
}

export function buildProfile(flags = {}) {
  const deployTarget = String(flags['deploy-target']).trim().toLowerCase();
  const siteId = String(flags['site-id']).trim();
  const zoneName = String(flags.zone).trim();
  const outputPath = resolveOutputPath(flags);
  const resolvedProjectRoot = path.resolve(String(flags['project-root']).trim());
  const storedProjectRoot = normalizeRelative(path.dirname(outputPath), resolvedProjectRoot);
  const linkedSchema = path.join(resolvedProjectRoot, 'Web_Toolkit', 'site-profile.schema.json');
  let schemaRef;
  if (fs.existsSync(linkedSchema)) {
    schemaRef = normalizeRelative(path.dirname(outputPath), linkedSchema);
    if (!schemaRef.startsWith('.')) schemaRef = `./${schemaRef}`;
  } else if (storedProjectRoot === '.' || storedProjectRoot === '') {
    // Conventional path after link-web-toolkit; avoids escaping to absolute host paths.
    schemaRef = './Web_Toolkit/site-profile.schema.json';
  } else {
    schemaRef = normalizeRelative(path.dirname(outputPath), SCHEMA_PATH);
    if (schemaRef.startsWith('../') && !schemaRef.includes('Web_Toolkit/site-profile.schema.json')) {
      schemaRef = './Web_Toolkit/site-profile.schema.json';
    }
  }

  const defaultDeployDev = deployTarget === 'workers'
    ? 'npm run preview'
    : 'npm run cf:deploy:preview';
  const defaultDeployProd = 'npm run cf:deploy';

  return {
    outputPath,
    profile: {
      $schema: schemaRef,
      siteId,
      projectRoot: storedProjectRoot,
      deployTarget,
      zone: { name: zoneName },
      metadata: {
        registrar: String(flags.registrar || '').trim(),
        dnsProvider: String(flags['dns-provider'] || 'cloudflare').trim(),
        emailEnabled: toBool(flags['email-enabled'], false),
        emailProvider: String(flags['email-provider'] || '').trim(),
        notes: csvList(flags.notes || '')
      },
      hosts: {
        production: csvList(flags['prod-hosts']),
        development: csvList(flags['dev-hosts'])
      },
      commands: {
        install: String(flags.install || 'npm install').trim(),
        check: String(flags.check || 'npm run check').trim(),
        build: String(flags.build || 'npm run build').trim(),
        preview: String(flags.preview || 'npm run preview').trim(),
        tests: csvList(flags.tests || ''),
        deploy: {
          development: String(flags['deploy-dev'] || defaultDeployDev).trim(),
          production: String(flags['deploy-prod'] || defaultDeployProd).trim()
        }
      },
      cloudflare: {
        account: {
          name: String(flags['account-name'] || '').trim(),
          id: String(flags['account-id'] || '').trim()
        },
        ...(deployTarget === 'workers'
          ? {
              workerNames: {
                production: String(flags['worker-prod'] || `${siteId}-app`).trim(),
                development: String(flags['worker-dev'] || `${siteId}-app-dev`).trim()
              }
            }
          : {
              pagesProject: String(flags['pages-project'] || siteId).trim()
            }),
        crawlPolicy: {
          production: String(flags['crawl-prod'] || 'allow').trim(),
          development: String(flags['crawl-dev'] || 'block').trim()
        },
        cachePurge: {
          defaultMode: String(flags['cache-mode'] || 'url').trim(),
          defaultEnvironment: String(flags['cache-environment'] || 'production').trim()
        },
        dns: {
          expectedRecords: csvList(flags['expected-records']).map((entry) => ({ summary: entry })),
          expectedNameservers: csvList(flags['expected-nameservers'])
        }
      }
    }
  };
}
