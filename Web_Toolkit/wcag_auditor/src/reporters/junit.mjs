export function renderJunitReport(run) {
  const cases = run.findings.length > 0 ? run.findings : [syntheticPass(run)];
  const failures = cases.filter((finding) => !finding.suppressed && finding.outcome === 'failed').length;
  const errors = cases.filter((finding) => !finding.suppressed && finding.outcome === 'executionError').length;
  const skipped = cases.filter((finding) => finding.suppressed || ['cantTell', 'untested', 'inapplicable'].includes(finding.outcome)).length;
  const body = cases.map(renderCase).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${xml(run.project.name)} accessibility" tests="${cases.length}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${seconds(run.durationMs)}">\n${body}\n</testsuite>\n`;
}

function renderCase(finding) {
  const name = `${finding.ruleId} ${finding.target?.routeOrScene ?? finding.target?.file ?? ''}`.trim();
  const attributes = `classname="${xml(finding.target?.adapter ?? 'accessibility')}" name="${xml(name)}"`;
  const details = xml(JSON.stringify({
    outcome: finding.outcome,
    severity: finding.severity,
    fingerprint: finding.fingerprint,
    evidence: finding.evidence,
    remediation: finding.remediation
  }, null, 2));
  if (finding.suppressed) return `  <testcase ${attributes}><skipped message="suppressed">${details}</skipped></testcase>`;
  if (finding.outcome === 'failed') return `  <testcase ${attributes}><failure message="${xml(finding.title)}">${details}</failure></testcase>`;
  if (finding.outcome === 'executionError') return `  <testcase ${attributes}><error message="${xml(finding.title)}">${details}</error></testcase>`;
  if (['cantTell', 'untested', 'inapplicable'].includes(finding.outcome)) {
    return `  <testcase ${attributes}><skipped message="${xml(finding.outcome)}">${details}</skipped></testcase>`;
  }
  return `  <testcase ${attributes} />`;
}

function syntheticPass(run) {
  return {
    ruleId: 'wcag-auditor/run',
    title: 'Accessibility run completed without findings',
    outcome: 'passed',
    severity: 'advisory',
    fingerprint: run.id,
    target: { adapter: 'runner' },
    evidence: null,
    remediation: ''
  };
}

function seconds(milliseconds) {
  return (milliseconds / 1000).toFixed(3);
}

function xml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
