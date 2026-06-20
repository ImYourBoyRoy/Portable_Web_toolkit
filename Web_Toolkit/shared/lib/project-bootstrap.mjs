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

  const requiredEntries = [];
  const optionalEntries = [];
  const seen = new Set();

  const pushEntry = (collection, key, value = '', note = '') => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || seen.has(normalizedKey)) return;
    seen.add(normalizedKey);
    collection.push({ key: normalizedKey, value: String(value ?? ''), note: String(note || '').trim() });
  };

  pushEntry(requiredEntries, 'CLOUDFLARE_API_TOKEN', '', 'required for live Cloudflare audits and deploys');
  pushEntry(optionalEntries, 'CF_ZONE_NAME', zoneName, zoneName ? 'defaults to the linked site profile zone' : 'fill in the production zone/domain');
  pushEntry(optionalEntries, 'CLOUDFLARE_ACCOUNT_ID', cloudflareAccountId, 'optional Cloudflare account id hint');
  pushEntry(optionalEntries, 'CF_ACCOUNT_NAME', cloudflareAccountName, 'optional Cloudflare account name hint');
  pushEntry(optionalEntries, 'GOOGLE_PAGESPEED_API_KEY', '', 'optional PageSpeed Insights API key');

  if (integrationEntries.length === 0) {
    pushEntry(optionalEntries, 'PUBLIC_ANALYTICS_ENABLED', 'true', 'common analytics toggle');
    pushEntry(optionalEntries, 'WEB3FORMS_ACCESS_KEY', '', 'optional basic contact-form provider key');
  }

  for (const entry of integrationEntries) {
    pushEntry(entry.required ? requiredEntries : optionalEntries, entry.key, devVarsExample[entry.key] || '', entry.required ? 'required by the active site profile' : 'used by the active site profile when enabled');
  }

  for (const [key, value] of Object.entries(devVarsExample)) {
    pushEntry(optionalEntries, key, value, 'carried over from .dev.vars.example');
  }

  const lines = [
    '# Created by portable project bootstrap helpers',
    '# Fill in the live values in the project root `.env`.',
    '# Keep secrets out of the portable folder.',
    ''
  ];

  if (requiredEntries.length > 0) {
    lines.push('# Required first');
    for (const entry of requiredEntries) {
      if (entry.note) lines.push(`# ${entry.note}`);
      lines.push(`${entry.key}=${entry.value}`);
    }
    lines.push('');
  }

  if (optionalEntries.length > 0) {
    lines.push('# Optional / profile-specific');
    for (const entry of optionalEntries) {
      if (entry.note) lines.push(`# ${entry.note}`);
      lines.push(`${entry.key}=${entry.value}`);
    }
    lines.push('');
  }

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
2. Fill in the project root \`.env\` from \`.env.example\`.
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

