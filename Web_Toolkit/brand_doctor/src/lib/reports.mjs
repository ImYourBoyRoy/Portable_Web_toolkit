// ./Web_Toolkit/brand_doctor/src/lib/reports.mjs
/**
 * Report writers for brand-doctor.
 */

import fs from 'node:fs';

export function writeReport(paths, report) {
  fs.mkdirSync(paths.outputDir, { recursive: true });
  fs.writeFileSync(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const lines = [
    '# Brand Doctor',
    '',
    `- Checked at: ${report.checkedAt}`,
    `- Project root: ${report.projectRoot}`,
    `- Overall: ${report.summary.overall.toUpperCase()}`,
    ''
  ];
  if (report.summary.issues.length > 0) {
    lines.push('## Issues', '');
    for (const issue of report.summary.issues) lines.push(`- ${issue}`);
    lines.push('');
  }
  if (report.summary.recommendations.length > 0) {
    lines.push('## Recommendations', '');
    for (const item of report.summary.recommendations) {
      lines.push(`- [${item.risk.toUpperCase()}] ${item.summary}`);
      lines.push(`  - Command: ${item.command}`);
    }
    lines.push('');
  }
  fs.writeFileSync(paths.mdPath, `${lines.join('\n')}\n`, 'utf8');
}

