// ./Web_Toolkit/image_pipeline/src/lib/reports.mjs
/**
 * Report rendering helpers for image-pipeline.
 */

import fs from 'node:fs';

export function writeReport(paths, report) {
  fs.mkdirSync(paths.outputDir, { recursive: true });
  fs.writeFileSync(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const lines = [
    '# Image Pipeline',
    '',
    `- Checked at: ${report.checkedAt}`,
    `- Project root: ${report.projectRoot}`,
    `- Mode: ${report.mode}`,
    `- Eligible images: ${report.summary.eligibleCount}`,
    `- Excluded images: ${report.summary.excludedCount}`,
    `- Converted images: ${report.summary.convertedCount}`,
    ''
  ];
  if (report.summary.notes.length > 0) {
    lines.push('## Notes', '');
    for (const note of report.summary.notes) lines.push(`- ${note}`);
    lines.push('');
  }
  lines.push('## Images', '', '| File | Format | Size | Eligible | Exclusion | Suggested output |', '| --- | --- | --- | --- | --- | --- |');
  for (const image of report.images) {
    lines.push(`| ${image.relativePath} | ${image.format} | ${image.width}x${image.height} | ${image.eligibleForWebp} | ${image.excludedReason || ''} | ${image.suggestedOutput || ''} |`);
  }
  fs.writeFileSync(paths.mdPath, `${lines.join('\n')}\n`, 'utf8');
}

