// ./Web_Toolkit/headers_deploy/src/lib/audit-lib.mjs
/**
 * Shared `_headers` audit helpers for headers-deploy and discovery-doctor.
 */

import fs from 'node:fs';
import { REQUIRED_DIST_HEADERS } from './zenith-baseline.mjs';

export function auditHeadersContent(content = '') {
  const text = String(content || '');
  const missing = REQUIRED_DIST_HEADERS.filter((header) => {
    const pattern = new RegExp(`^\\s*${header}:`, 'im');
    return !pattern.test(text);
  });

  return {
    ok: missing.length === 0,
    missing,
    present: REQUIRED_DIST_HEADERS.filter((header) => !missing.includes(header)),
  };
}

export function auditHeadersFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      ok: false,
      filePath,
      missing: REQUIRED_DIST_HEADERS,
      present: [],
      error: 'file missing',
    };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const result = auditHeadersContent(content);
  return { ...result, filePath, error: null };
}

export function findDistHeadersCandidates(distPath) {
  return [
    distPath,
    `${distPath}/_headers`,
    `${distPath}/client/_headers`,
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);
}

export function auditDistTree(distPath) {
  const candidates = [
    `${distPath}/_headers`,
    `${distPath}/client/_headers`,
  ].filter((filePath) => fs.existsSync(filePath));

  if (candidates.length === 0) {
    return {
      ok: false,
      filePath: null,
      missing: REQUIRED_DIST_HEADERS,
      present: [],
      error: 'no _headers file under dist/ or dist/client/',
    };
  }

  for (const filePath of candidates) {
    const result = auditHeadersFile(filePath);
    if (result.ok) return result;
  }

  return auditHeadersFile(candidates[0]);
}
