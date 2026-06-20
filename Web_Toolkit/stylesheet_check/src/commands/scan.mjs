// ./Web_Toolkit/stylesheet_check/src/commands/scan.mjs
/**
 * Stylesheet architecture scan command.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { scanStylesheets } from '../lib/scanner.mjs';

function parseLimit(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function runScan(flags = {}) {
  const root = path.resolve(String(flags.root || process.cwd()));
  const report = scanStylesheets(root, {
    maxInlineLines: parseLimit(flags['max-inline-lines'], 15),
    maxFileLines: parseLimit(flags['max-file-lines'], 500),
    minDuplicateRuleLines: parseLimit(flags['min-duplicate-rule-lines'], 4)
  });

  if (flags['json-out']) {
    const outPath = path.resolve(String(flags['json-out']));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.summary.errors > 0 ? 2 : report.summary.warnings > 0 ? 2 : 0;
  }

  console.log('\nStylesheet check');
  console.log(`- Root: ${report.root}`);
  console.log(`- Scanned: ${report.scanned.componentFiles} component files, ${report.scanned.stylesheetFiles} stylesheets`);
  console.log(`- Limits: inline ${report.limits.maxInlineLines} lines, file ${report.limits.maxFileLines} lines`);
  console.log(`- Findings: ${report.summary.total} (${report.summary.errors} errors, ${report.summary.warnings} warnings)`);

  for (const finding of report.findings.slice(0, 30)) {
    console.log(`  • [${finding.severity}] ${finding.category} ${finding.file}:${finding.line} — ${finding.label}`);
    console.log(`    ${finding.excerpt}`);
  }
  if (report.findings.length > 30) {
    console.log(`  • ... ${report.findings.length - 30} more`);
  }

  return report.summary.errors > 0 ? 2 : report.summary.warnings > 0 ? 2 : 0;
}
