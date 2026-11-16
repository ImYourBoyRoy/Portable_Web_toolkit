// ./Web_Toolkit/form_doctor/src/report.mjs
/** Console and JSON rendering for form-doctor. Plain text, one line per finding, no color dependency. */

import fs from 'node:fs';
import path from 'node:path';
import { summarize } from './scan.mjs';

export function renderScan(scan) {
  const lines = [`form-doctor scan: ${scan.root}`, `  form pages: ${scan.forms.length}, handlers: ${scan.handlers.length}`];
  for (const f of scan.findings) {
    lines.push(`  [${f.severity.toUpperCase()}] ${f.rule} ${f.file}${f.line ? `:${f.line}` : ''}`);
    lines.push(`      ${f.message}`);
    if (f.fix) lines.push(`      Fix: ${f.fix}`);
  }
  const s = summarize(scan.findings);
  lines.push(`  Summary: fail=${s.fail} warn=${s.warn} info=${s.info}`);
  return lines.join('\n');
}

export function renderProbe(results, label) {
  const lines = [`form-doctor probe: ${label}`];
  for (const r of results) lines.push(`  [${r.status.toUpperCase()}] ${r.id}: ${r.detail}`);
  const count = (s) => results.filter((r) => r.status === s).length;
  lines.push(`  Summary: pass=${count('pass')} fail=${count('fail')} warn=${count('warn')} info=${count('info')}`);
  return lines.join('\n');
}

export function writeJson(report, target) {
  const file = path.resolve(target);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}

export function exitCodeFor({ findings = [], probes = [] }, strict = false) {
  const failed = findings.some((f) => f.severity === 'fail') || probes.some((p) => p.status === 'fail');
  const warned = findings.some((f) => f.severity === 'warn') || probes.some((p) => p.status === 'warn');
  return failed || (strict && warned) ? 2 : 0;
}
