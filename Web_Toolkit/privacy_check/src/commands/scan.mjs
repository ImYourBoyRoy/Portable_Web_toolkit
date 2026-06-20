// ./Web_Toolkit/privacy_check/src/commands/scan.mjs
/**
 * Privacy/sanitization scan command.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { scanRoot } from '../lib/scanner.mjs';

export async function runScan(flags = {}) {
  const root = path.resolve(String(flags.root || process.cwd()));
  const findings = scanRoot(root);
  const report = {
    checkedAt: new Date().toISOString(),
    root,
    findings,
    summary: {
      total: findings.length,
      secrets: findings.filter((entry) => entry.category === 'secret').length,
      paths: findings.filter((entry) => entry.category === 'path').length,
      siteSpecific: findings.filter((entry) => entry.category === 'site-specific').length
    }
  };

  if (flags['json-out']) {
    const outPath = path.resolve(String(flags['json-out']));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return findings.length > 0 ? 2 : 0;
  }

  console.log('\nPrivacy check');
  console.log(`- Root: ${root}`);
  console.log(`- Findings: ${findings.length}`);
  for (const finding of findings.slice(0, 20)) {
    console.log(`  • [${finding.category}] ${finding.file}:${finding.line} — ${finding.label} — ${finding.excerpt}`);
  }
  if (findings.length > 20) {
    console.log(`  • ... ${findings.length - 20} more`);
  }
  return findings.length > 0 ? 2 : 0;
}

