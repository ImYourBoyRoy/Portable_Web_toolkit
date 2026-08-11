// ./Web_Toolkit/brand_doctor/src/commands/sync-tokens.mjs
/**
 * Sync Brand Guide hex colors into src/styles/tokens.css and optional profile branding.
 *
 * Dry-run by default; pass --apply to write. Managed block is delimited so re-runs
 * replace only toolkit-owned tokens.
 */

import fs from 'node:fs';
import path from 'node:path';
import { findBrandGuide } from '../lib/brand-guide.mjs';
import { resolveProjectRoot } from '../lib/paths.mjs';

const START = '/* portable-brand-doctor: brand-guide-tokens:start */';
const END = '/* portable-brand-doctor: brand-guide-tokens:end */';

const SEMANTIC_NAMES = [
  'color-brand-primary',
  'color-brand-secondary',
  'color-brand-accent',
  'color-brand-surface',
  'color-brand-ink',
  'color-brand-muted',
  'color-brand-highlight',
  'color-brand-border'
];

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

/**
 * Prefer "Name: #hex" / "**Accent** `#hex`" labeled pairs; else sequential guide colors.
 * @param {string} raw
 * @param {string[]} colors
 */
export function mapGuideColorsToTokens(raw = '', colors = []) {
  const labeled = [];
  for (const match of String(raw).matchAll(
    /(?:^|\n)\s*(?:\*\*)?([A-Za-z][A-Za-z0-9 _/-]{1,40})(?:\*\*)?\s*[:=]\s*`?(#[0-9a-fA-F]{3,8})`?/g
  )) {
    const label = String(match[1] || '').trim().toLowerCase();
    const hex = String(match[2] || '').toLowerCase();
    if (!hex) continue;
    let token = '';
    if (/primary|brand(?!\s*secondary)/.test(label)) token = 'color-brand-primary';
    else if (/secondary/.test(label)) token = 'color-brand-secondary';
    else if (/accent|highlight|cta/.test(label)) token = 'color-brand-accent';
    else if (/surface|background|bg/.test(label)) token = 'color-brand-surface';
    else if (/ink|text|foreground|fg/.test(label)) token = 'color-brand-ink';
    else if (/muted|subtle/.test(label)) token = 'color-brand-muted';
    else if (/border|line|rule/.test(label)) token = 'color-brand-border';
    if (token) labeled.push({ token, hex, label });
  }

  const byToken = new Map();
  for (const entry of labeled) {
    if (!byToken.has(entry.token)) byToken.set(entry.token, entry.hex);
  }

  let index = 0;
  for (const hex of colors) {
    while (index < SEMANTIC_NAMES.length && byToken.has(SEMANTIC_NAMES[index])) index += 1;
    if (index >= SEMANTIC_NAMES.length) break;
    if (![...byToken.values()].includes(hex)) {
      byToken.set(SEMANTIC_NAMES[index], hex);
      index += 1;
    }
  }

  return [...byToken.entries()].map(([token, hex]) => ({ token, hex }));
}

function buildManagedBlock(entries, guideRelative) {
  const lines = [
    START,
    `  /* Synced from ${guideRelative || 'BRAND_GUIDE.md'} — edit the guide, then re-run brand-doctor sync-tokens */`
  ];
  for (const entry of entries) {
    lines.push(`  --${entry.token}: ${entry.hex};`);
  }
  lines.push(`  ${END}`);
  return lines.join('\n');
}

function upsertTokensCss(existing, managedBlock) {
  if (!existing.trim()) {
    return `/* ./src/styles/tokens.css */\n:root {\n${managedBlock}\n}\n`;
  }
  if (existing.includes(START) && existing.includes(END)) {
    return existing.replace(
      new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`),
      managedBlock.trim()
    );
  }
  if (/:root\s*\{/.test(existing)) {
    return existing.replace(/:root\s*\{/, `:root {\n${managedBlock}`);
  }
  return `${existing.trim()}\n\n:root {\n${managedBlock}\n}\n`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function profileBrandingPatch(entries) {
  const colors = {};
  for (const entry of entries) {
    if (entry.token === 'color-brand-primary') colors.primary = entry.hex;
    if (entry.token === 'color-brand-accent') colors.accent = entry.hex;
    if (entry.token === 'color-brand-secondary') colors.secondary = entry.hex;
    if (entry.token === 'color-brand-surface') colors.background = entry.hex;
    if (entry.token === 'color-brand-ink') colors.text_primary = entry.hex;
    if (entry.token === 'color-brand-muted') colors.text_secondary = entry.hex;
    if (entry.token === 'color-brand-accent' || entry.token === 'color-brand-highlight') {
      colors.glow = colors.glow || entry.hex;
    }
  }
  return colors;
}

export async function runSyncTokens(flags = {}) {
  const projectRoot = resolveProjectRoot(flags);
  const apply = toBool(flags.apply, false);
  const guide = findBrandGuide(projectRoot);

  if (!guide.found) {
    console.error('[brand-doctor] No BRAND_GUIDE.md found — create one before sync-tokens.');
    return 2;
  }

  const raw = fs.readFileSync(guide.path, 'utf8');
  const entries = mapGuideColorsToTokens(raw, guide.colors);
  if (entries.length === 0) {
    console.error('[brand-doctor] Brand Guide has no usable hex colors to sync.');
    return 2;
  }

  const tokensPath = path.join(projectRoot, 'src', 'styles', 'tokens.css');
  const existing = fs.existsSync(tokensPath) ? fs.readFileSync(tokensPath, 'utf8') : '';
  const managedBlock = buildManagedBlock(entries, guide.relativePath);
  const nextCss = upsertTokensCss(existing, managedBlock);
  const brandingPatch = profileBrandingPatch(entries);

  console.log('\n[brand-doctor] sync-tokens');
  console.log(`- Brand Guide: ${guide.relativePath}`);
  console.log(`- Tokens: ${path.relative(projectRoot, tokensPath).replace(/\\/g, '/')}`);
  console.log(`- Mapped: ${entries.map((e) => `--${e.token}=${e.hex}`).join(', ')}`);
  console.log(`- Apply: ${apply ? 'yes' : 'no (dry-run)'}`);

  if (!apply) {
    console.log('\n[dry-run] Would write managed token block:');
    console.log(managedBlock);
    return 0;
  }

  fs.mkdirSync(path.dirname(tokensPath), { recursive: true });
  fs.writeFileSync(tokensPath, nextCss.endsWith('\n') ? nextCss : `${nextCss}\n`, 'utf8');
  console.log(`- Wrote ${tokensPath}`);

  // Optional profile patch when --site-profile is present
  const profileFlag = String(flags['site-profile'] || flags.profile || '').trim();
  if (profileFlag && Object.keys(brandingPatch).length) {
    const profilePath = path.isAbsolute(profileFlag)
      ? profileFlag
      : path.join(projectRoot, profileFlag);
    if (fs.existsSync(profilePath)) {
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      profile.branding = profile.branding || {};
      profile.branding.colors = { ...(profile.branding.colors || {}), ...brandingPatch };
      fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
      console.log(`- Patched branding.colors in ${path.relative(projectRoot, profilePath).replace(/\\/g, '/')}`);
    }
  }

  return 0;
}
