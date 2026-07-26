// ./Web_Toolkit/privacy_check/src/lib/scanner.mjs
/**
 * Filesystem scanner for privacy/sanitization checks.
 */

import fs from 'node:fs';
import path from 'node:path';
import { FINDING_PATTERNS } from './patterns.mjs';

function isTextFile(filePath) {
  return /\.(md|txt|json|mjs|cjs|js|ts|tsx|toml|yml|yaml|env|example|bat|command)$/i.test(filePath);
}

function shouldSkip(relativePath) {
  if (['.git', 'node_modules', '.astro', '.runtime'].some((entry) => relativePath.includes(`${entry}/`) || relativePath === entry)) {
    return true;
  }
  if (relativePath === 'output' || relativePath.startsWith('output/')) return true;
  if (relativePath === 'dist' || relativePath.startsWith('dist/')) return true;
  return false;
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

function shouldIgnoreMatch(definition, value) {
  return definition.label === 'Email address' && isReservedExampleEmail(value);
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

function scanFile(filePath, relativePath) {
  if (!isTextFile(filePath)) return dynamicFindings(relativePath);
  const content = fs.readFileSync(filePath, 'utf8');
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
      stat = fs.statSync(current);
    } catch {
      continue;
    }
    const relativePath = path.relative(rootPath, current).replace(/\\/g, '/');
    if (relativePath && shouldSkip(relativePath)) continue;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        queue.push(path.join(current, entry));
      }
      continue;
    }
    findings.push(...scanFile(current, relativePath || path.basename(current)));
  }
  return findings;
}
