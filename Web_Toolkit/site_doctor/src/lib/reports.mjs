// ./Web_Toolkit/site_doctor/src/lib/reports.mjs
/**
 * Report parsing helpers for the portable site doctor tool.
 */

import fs from 'node:fs';
import path from 'node:path';

export function extractReportPath(output = '', projectRoot = '') {
  const match = String(output).match(/^(?:-\s*)?(?:Report|JSON):\s*(.+)\s*$/im);
  if (!match) return '';
  const candidate = match[1].trim();
  return path.isAbsolute(candidate) ? candidate : path.resolve(projectRoot || process.cwd(), candidate);
}

export function parseJsonSafe(value, fallback = null) {
  try {
    return JSON.parse(String(value || '').trim());
  } catch {
    return fallback;
  }
}

export function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return parseJsonSafe(fs.readFileSync(filePath, 'utf8'), null);
}

export function latestDoctorReports(projectRoot) {
  const outputDir = path.join(projectRoot, 'output');
  if (!fs.existsSync(outputDir)) return [];
  return fs.readdirSync(outputDir)
    .filter((name) => /^site-doctor-.*\.json$/i.test(name))
    .map((name) => path.join(outputDir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

