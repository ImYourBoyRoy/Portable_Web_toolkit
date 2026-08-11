// ./Web_Toolkit/shared/lib/project-bootstrap.mjs
/**
 * Shared project bootstrap helpers for non-destructive initialization flows.
 *
 * These helpers generate safe starter files and env templates for fresh or
 * partially-built website projects without overwriting existing work.
 */

import path from 'node:path';
import { loadEnvFile } from './env.mjs';

export function normalizeProjectName(projectRoot = '', explicitName = '') {
  const preferred = String(explicitName || '').trim();
  if (preferred) return preferred;
  const baseName = path.basename(String(projectRoot || '').trim());
  if (!baseName) return 'Website Project';
  return baseName.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function collectIntegrationEnvEntries(profile = {}) {
  const entries = new Map();
  const integrations = profile?.diagnostics?.integrations || {};
  for (const category of Object.values(integrations)) {
    for (const definition of Object.values(category || {})) {
      const required = Boolean(definition?.required);
      for (const key of definition?.envKeys || []) {
        const normalizedKey = String(key || '').trim();
        if (!normalizedKey) continue;
        const previous = entries.get(normalizedKey);
        entries.set(normalizedKey, { key: normalizedKey, required: previous?.required || required });
      }
    }
  }
  return [...entries.values()];
}

export function buildProjectEnvExample({ projectRoot = '', profile = null } = {}) {
  const devVarsExample = loadEnvFile(path.join(projectRoot, '.dev.vars.example'));
  const integrationEntries = collectIntegrationEnvEntries(profile || {});
  const zoneName = String(profile?.zone?.name || '').trim();
  const cloudflareAccountId = String(profile?.cloudflare?.account?.id || '').trim();
  const cloudflareAccountName = String(profile?.cloudflare?.account?.name || '').trim();
  const deployTarget = String(profile?.deployTarget || profile?.cloudflare?.deployTarget || '').trim().toLowerCase();

  // A = required API · B = agent+user naming · C = recommended analytics · D = optional
  const requiredApiEntries = [];
  const agentUserEntries = [];
  const recommendedAnalyticsEntries = [];
  const optionalFeatureEntries = [];
  const seen = new Set();

  const pushEntry = (collection, key, value = '', note = '') => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || seen.has(normalizedKey)) return;
    seen.add(normalizedKey);
    collection.push({ key: normalizedKey, value: String(value ?? ''), note: String(note || '').trim() });
  };

  const writeSection = (lines, title, entries) => {
    if (!entries.length) return;
    lines.push(title);
    for (const entry of entries) {
      if (entry.note) lines.push(`# ${entry.note}`);
      lines.push(`${entry.key}=${entry.value}`);
    }
    lines.push('');
  };

  // A) User-only API credentials (never invent)
  pushEntry(requiredApiEntries, 'CLOUDFLARE_API_TOKEN', '', 'USER pastes — Cloudflare API token (Custom Create Token)');
  pushEntry(requiredApiEntries, 'GOOGLE_PAGESPEED_API_KEY', '', 'USER pastes — Google PageSpeed Insights API key');

  // B) Agent + user naming / IDs (propose from domain/folder; confirm)
  pushEntry(agentUserEntries, 'CLOUDFLARE_ACCOUNT_ID', cloudflareAccountId, 'AGENT+USER — look up via API after token when possible');
  pushEntry(agentUserEntries, 'CF_ACCOUNT_NAME', cloudflareAccountName, 'AGENT+USER — human account label');
  pushEntry(agentUserEntries, 'CF_ZONE_NAME', zoneName, zoneName ? 'AGENT+USER — from site profile zone' : 'AGENT+USER — production zone/domain from interview');
  if (deployTarget !== 'pages') {
    pushEntry(agentUserEntries, 'CF_WORKER_NAME', '', 'AGENT+USER — propose from domain/folder (Workers)');
  }
  if (deployTarget !== 'workers') {
    pushEntry(agentUserEntries, 'CF_PAGES_PROJECT', '', 'AGENT+USER — propose from domain/folder (Pages)');
  }
  pushEntry(agentUserEntries, 'PUBLIC_SITE_URL', zoneName ? `https://${zoneName}` : '', 'AGENT+USER — propose canonical production URL');
  pushEntry(agentUserEntries, 'PUBLIC_SECURITY_CONTACT', '', 'AGENT+USER — security.txt contact (mailto: or https:)');

  // C) Recommended analytics — explain WHY early (PostHog + GA4)
  pushEntry(recommendedAnalyticsEntries, 'PUBLIC_ANALYTICS_ENABLED', 'true', 'RECOMMENDED — set false only if user explicitly declines analytics');
  pushEntry(recommendedAnalyticsEntries, 'PUBLIC_POSTHOG_API_KEY', '', 'RECOMMENDED — PostHog project key (product analytics / replay)');
  pushEntry(recommendedAnalyticsEntries, 'PUBLIC_POSTHOG_API_HOST', 'https://us.i.posthog.com', 'PostHog API host');
  pushEntry(recommendedAnalyticsEntries, 'PUBLIC_GA4_MEASUREMENT_ID', '', 'RECOMMENDED — GA4 measurement id (G-…)');

  if (integrationEntries.length === 0) {
    pushEntry(optionalFeatureEntries, 'WEB3FORMS_ACCESS_KEY', '', 'optional contact-form provider key');
    pushEntry(optionalFeatureEntries, 'RESEND_API_KEY', '', 'optional Resend API key');
    pushEntry(optionalFeatureEntries, 'RESEND_FROM', '', 'optional Resend from address');
    pushEntry(optionalFeatureEntries, 'PUBLIC_TURNSTILE_SITE_KEY', '', 'optional Turnstile site key');
    pushEntry(optionalFeatureEntries, 'TURNSTILE_SECRET_KEY', '', 'optional Turnstile secret');
    pushEntry(optionalFeatureEntries, 'INSTAGRAM_USERNAME', '', 'optional Instagram handle for gallery');
    pushEntry(optionalFeatureEntries, 'INSTAGRAM_CLONE_LIMIT', '24', 'optional Instagram clone post limit');
    pushEntry(optionalFeatureEntries, 'PORKBUN_API_KEY', '', 'optional example registrar (Porkbun) — not required');
    pushEntry(optionalFeatureEntries, 'PORKBUN_SECRET_KEY', '', 'optional example registrar (Porkbun) — not required');
  }

  for (const entry of integrationEntries) {
    const key = entry.key;
    let target = optionalFeatureEntries;
    let note = 'profile-enabled optional feature';
    if (entry.required) {
      target = requiredApiEntries;
      note = 'required by the active site profile (USER pastes)';
    } else if (
      key === 'PUBLIC_POSTHOG_API_KEY'
      || key === 'PUBLIC_POSTHOG_API_HOST'
      || key === 'PUBLIC_GA4_MEASUREMENT_ID'
      || key === 'PUBLIC_ANALYTICS_ENABLED'
    ) {
      target = recommendedAnalyticsEntries;
      note = 'RECOMMENDED analytics (explain early; USER pastes if agreed)';
    }
    pushEntry(target, key, devVarsExample[key] || '', note);
  }

  for (const [key, value] of Object.entries(devVarsExample)) {
    pushEntry(optionalFeatureEntries, key, value, 'carried over from .dev.vars.example');
  }

  const lines = [
    '# Created by portable project bootstrap helpers',
    '# A = USER API secrets · B = AGENT+USER naming · C = recommended analytics · D = optional',
    '# Keep live secrets in the project root `.env` only — never commit them.',
    ''
  ];

  writeSection(lines, '# ---- A) REQUIRED API CREDENTIALS (user pastes) ----', requiredApiEntries);
  writeSection(lines, '# ---- B) AGENT + USER (propose names/IDs; confirm) ----', agentUserEntries);
  writeSection(lines, '# ---- C) RECOMMENDED ANALYTICS (explain WHY early — PostHog + GA4) ----', recommendedAnalyticsEntries);
  writeSection(lines, '# ---- D) OPTIONAL FEATURES (forms, gallery, registrar e.g. Porkbun) ----', optionalFeatureEntries);

  return `${lines.join('\n').trim()}\n`;
}

export function renderProjectReadme({ projectRoot = '', projectName = '', siteProfilePath = '' } = {}) {
  const normalizedName = normalizeProjectName(projectRoot, projectName);
  const siteProfileLine = siteProfilePath ? `- Linked site profile: \`${siteProfilePath}\`` : '- Linked site profile: pending';
  return `# ${normalizedName}

## What this is

A website project prepared to work with the portable Astro + Cloudflare toolkit.

## Current status

- Project root: \`${projectRoot}\`
${siteProfileLine}
- Project root \`.env\`: pending unless already created separately

## Recommended next steps

1. Create or link the site profile.
2. Fill project \`.env\`: user pastes **A** API keys; agent proposes **B** names/IDs; explain and wire **C** PostHog+GA4 early; enable **D** only for opted-in features (Porkbun is one optional registrar example).
3. Add or verify the web app scaffold.
4. Run portable project checks before any live deploys.

## Notes

- Keep live secrets in the project root \`.env\`.
- Keep reusable operations logic in the separate portable toolkit.
`;
}

export function renderProjectMemory({ projectRoot = '', projectName = '', siteProfilePath = '' } = {}) {
  const normalizedName = normalizeProjectName(projectRoot, projectName);
  const siteProfileLine = siteProfilePath ? `- Linked site profile: \`${siteProfilePath}\`` : '- Linked site profile: pending';
  return `# Project Memory

## Project Snapshot

- Name: ${normalizedName}
- Project root: \`${projectRoot}\`
${siteProfileLine}

## Working Directory Map

- root: main website project files
- output/: generated reports and diagnostics (create when needed)

## Current Goals

- stand up or verify the website project safely
- keep live secrets in the project root only

## Active Tasks / TODOs

- confirm site profile details
- create project root \`.env\`
- verify build, preview, and deploy readiness

## Architecture Notes

- intended for portable-toolkit-driven site workflows

## Decisions & Conventions

- do not store live secrets in the portable toolkit
- prefer non-destructive setup checks before mutation

## Known Issues / Risks

- add confirmed issues here as they are discovered

## Recent Changes

- bootstrap memory created

## Validation / Tests Run

- none yet

## Next Session Quick Start

- read \`README.md\`
- read \`MEMORY.md\`
- run the portable toolkit report or project init audit
`;
}

export function renderProjectGitignore() {
  return `# Node / Astro
node_modules/
dist/
.astro/

# Environment
.env
.dev.vars

# Reports / runtime
output/
coverage/

# Python
__pycache__/
*.pyc
.venv/

# OS / editor
.DS_Store
Thumbs.db
`;
}

