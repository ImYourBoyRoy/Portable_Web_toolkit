export function renderMarkdownReport(run) {
  const lines = [
    `# Accessibility report: ${escapeMarkdown(run.project.name)}`,
    '',
    `- Run: \`${run.id}\``,
    `- Profile: \`${run.profile}\``,
    `- Gate: **${run.gate.passed ? 'PASS' : run.gate.reason}** (exit ${run.gate.exitCode})`,
    `- Applicable surfaces: ${run.surfaceCount}`,
    `- Findings: ${run.summary.total} (${run.summary.suppressed} suppressed)`,
    '',
    '| Outcome | Severity | Rule | Location | Title |',
    '|---|---|---|---|---|'
  ];
  for (const finding of run.findings) {
    lines.push(`| ${finding.suppressed ? 'suppressed' : finding.outcome} | ${finding.severity} | \`${escapeMarkdown(finding.ruleId)}\` | ${escapeMarkdown(location(finding))} | ${escapeMarkdown(finding.title)} |`);
  }
  if (run.findings.length === 0) lines.push('| passed | advisory | `wcag-auditor/run` | — | No findings |');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function location(finding) {
  const file = finding.target.file;
  if (file) {
    const line = finding.target.line ? `:${finding.target.line}` : '';
    return `${file}${line}`;
  }
  return finding.target.routeOrScene ?? finding.target.selectorOrNode ?? '—';
}

function escapeMarkdown(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}
