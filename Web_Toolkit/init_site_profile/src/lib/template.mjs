// ./Web_Toolkit/init_site_profile/src/lib/template.mjs
/**
 * Template helpers for portable site profile generation.
 */

import path from 'node:path';
import { resolvePortableRoot } from '../../../shared/lib/context.mjs';

const PORTABLE_ROOT = resolvePortableRoot(import.meta.url, 3);

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

export function requiredQuestions() {
  return [
    'siteId',
    'projectRoot',
    'deployTarget (workers|pages)',
    'zone name',
    'production hosts',
    'development hosts (optional)',
    'current registrar',
    'current DNS provider',
    'whether email is active on the domain',
    'email provider (if email exists)',
    'expected nameservers (if known)',
    'install command',
    'check command',
    'build command',
    'preview command',
    'test commands',
    'deploy development command',
    'deploy production command'
  ];
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

export function buildProfile(flags = {}) {
  const deployTarget = String(flags['deploy-target']).trim().toLowerCase();
  const siteId = String(flags['site-id']).trim();
  const zoneName = String(flags.zone).trim();
  const outputPath = flags.output
    ? path.resolve(String(flags.output))
    : path.join(PORTABLE_ROOT, 'site-profiles', `${siteId}.site-profile.json`);
  const resolvedProjectRoot = path.resolve(String(flags['project-root']).trim());
  const storedProjectRoot = normalizeRelative(path.dirname(outputPath), resolvedProjectRoot);

  return {
    outputPath,
    profile: {
      $schema: '../site-profile.schema.json',
      siteId,
      projectRoot: storedProjectRoot,
      deployTarget,
      zone: { name: zoneName },
      metadata: {
        registrar: String(flags.registrar || '').trim(),
        dnsProvider: String(flags['dns-provider'] || '').trim(),
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
          development: String(flags['deploy-dev'] || '').trim(),
          production: String(flags['deploy-prod'] || '').trim()
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

