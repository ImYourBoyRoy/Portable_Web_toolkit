// ./Web_Toolkit/privacy_check/src/lib/scanner.mjs
/**
 * Filesystem scanner for privacy/sanitization checks.
 */

import fs from 'node:fs';
import path from 'node:path';
import { FINDING_PATTERNS } from './patterns.mjs';

/** Files above this size are not read (generated bundles, lockfiles, media). */
const MAX_SCAN_BYTES = 5 * 1024 * 1024;

const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|woff2?|ttf|otf|eot|zip|gz|tgz|xz|bz2|7z|rar|tar|pdf|mp[34]|mov|webm|wasm|so|dll|exe|dylib|pyc|sqlite|db)$/i;

/**
 * Scan every non-binary file, not an extension allowlist: secrets live in
 * extensionless or unusual files (.dev.vars, .env.local, .astro, .sh, .ps1, .pem).
 */
function readScannableText(filePath, size) {
  if (BINARY_EXTENSIONS.test(filePath) || size > MAX_SCAN_BYTES) return null;
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 8192).includes(0)) return null;
  return buffer.toString('utf8');
}

/** Generated/vendored folders skipped at any depth (mirrors export-portable-toolkit). */
const SKIPPED_SEGMENTS = new Set(['.git', 'node_modules', '.astro', '.runtime', '.wrangler', '.cf-agent', 'output', 'dist']);

function shouldSkip(relativePath) {
  return relativePath.split('/').some((segment) => SKIPPED_SEGMENTS.has(segment));
}

function redact(match) {
  if (match.length <= 10) return '[redacted]';
  return `${match.slice(0, 4)}...[redacted]...${match.slice(-4)}`;
}

function isReservedExampleEmail(value) {
  const domain = String(value).split('@').at(-1)?.toLowerCase() || '';
  return ['example.com', 'example.net', 'example.org'].includes(domain)
    || ['.example', '.invalid', '.localhost', '.test'].some(
      (suffix) => domain.endsWith(suffix),
    );
}

const PLACEHOLDER_HOME_USERS = new Set(['user', 'username', 'you', 'me', 'name', 'example', 'yourname', 'your-name', 'your_user', 'runner', 'ubuntu', 'node', 'app', 'deploy', 'project', 'alice', 'bob', 'foo']);

function isPlaceholderHomePath(value) {
  const user = String(value).split('/').at(-1)?.toLowerCase() || '';
  return PLACEHOLDER_HOME_USERS.has(user);
}

function shouldIgnoreMatch(definition, value) {
  if (definition.label === 'Email address') return isReservedExampleEmail(value);
  if (definition.label === 'Linux home path') return isPlaceholderHomePath(value);
  return false;
}

function dynamicFindings(relativePath) {
  const findings = [];
  const normalized = relativePath.replace(/\\/g, '/');
  const basename = path.basename(normalized);
  const isSiteProfileJson = /\.json$/i.test(basename)
    && !/^example-(workers|pages)\.json$/i.test(basename)
    && (
      /^site-profiles\//i.test(normalized)
      || /^Private_Site_Profiles\//i.test(normalized)
      || /(^|\/)site-profiles\//i.test(normalized)
      || basename.endsWith('.site-profile.json')
    );

  if (isSiteProfileJson) {
    findings.push({
      file: normalized,
      line: 1,
      category: 'site-specific',
      label: 'Non-example site profile',
      excerpt: '[site-profile redacted]'
    });
  }
  if (basename === 'doctor.txt') {
    findings.push({
      file: normalized,
      line: 1,
      category: 'artifact',
      label: 'Runtime doctor artifact',
      excerpt: '[runtime artifact redacted]'
    });
  }
  return findings;
}

function scanFile(filePath, relativePath, size) {
  const content = readScannableText(filePath, size);
  if (content === null) return dynamicFindings(relativePath);
  const findings = [...dynamicFindings(relativePath)];
  for (const definition of FINDING_PATTERNS) {
    const flags = definition.pattern.flags.includes('g')
      ? definition.pattern.flags
      : `${definition.pattern.flags}g`;
    const matcher = new RegExp(definition.pattern.source, flags);
    let match;
    while ((match = matcher.exec(content)) !== null) {
      if (shouldIgnoreMatch(definition, String(match[0]))) continue;
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push({
        file: relativePath,
        line,
        category: definition.category,
        label: definition.label,
        excerpt: redact(String(match[0]))
      });
    }
  }
  return findings;
}

export function scanRoot(rootPath) {
  const findings = [];
  const queue = [rootPath];
  while (queue.length > 0) {
    const current = queue.shift();
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    // Never follow symlinks: they can loop or point outside the scan root.
    if (stat.isSymbolicLink()) continue;
    const relativePath = path.relative(rootPath, current).replace(/\\/g, '/');
    if (relativePath && shouldSkip(relativePath)) continue;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        queue.push(path.join(current, entry));
      }
      continue;
    }
    findings.push(...scanFile(current, relativePath || path.basename(current), stat.size));
  }
  return findings;
}
