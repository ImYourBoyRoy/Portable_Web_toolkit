export function renderHtmlReport(run) {
  const rows = run.findings.map((finding) => `
          <tr>
            <td><span class="badge outcome-${escapeAttribute(finding.suppressed ? 'suppressed' : finding.outcome)}">${escapeHtml(finding.suppressed ? 'suppressed' : finding.outcome)}</span></td>
            <td>${escapeHtml(finding.severity)}</td>
            <td><code>${escapeHtml(finding.ruleId)}</code></td>
            <td>${escapeHtml(location(finding))}</td>
            <td>
              <strong>${escapeHtml(finding.title)}</strong>
              ${finding.description ? `<p>${escapeHtml(finding.description)}</p>` : ''}
              ${finding.remediation ? `<p><b>Remediation:</b> ${escapeHtml(finding.remediation)}</p>` : ''}
              <details>
                <summary>Evidence and metadata</summary>
                <pre>${escapeHtml(JSON.stringify({
                  fingerprint: finding.fingerprint,
                  standards: finding.standards,
                  evidence: finding.evidence,
                  suppression: finding.suppression
                }, null, 2))}</pre>
              </details>
            </td>
          </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Accessibility report — ${escapeHtml(run.project.name)}</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; --danger: #8b0000; --warning: #6b3d00; --success: #006b2d; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    a { color: LinkText; }
    a:focus-visible, summary:focus-visible { outline: 3px solid Highlight; outline-offset: 3px; }
    .skip { position: absolute; left: 1rem; top: -5rem; padding: .75rem 1rem; background: Canvas; border: 2px solid CanvasText; }
    .skip:focus { top: 1rem; }
    header, main { max-width: 90rem; margin: auto; padding: 1.25rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 1rem; }
    .card { border: 1px solid GrayText; border-radius: .5rem; padding: 1rem; }
    .card strong { display: block; font-size: 1.5rem; }
    .gate-pass { border-inline-start: .5rem solid var(--success); }
    .gate-fail { border-inline-start: .5rem solid var(--danger); }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid GrayText; padding: .65rem; text-align: left; vertical-align: top; }
    th { background: color-mix(in srgb, CanvasText 10%, Canvas); }
    tr:nth-child(even) { background: color-mix(in srgb, CanvasText 4%, Canvas); }
    .badge { display: inline-block; border: 1px solid currentColor; border-radius: 999px; padding: .1rem .55rem; font-weight: 700; }
    .outcome-failed, .outcome-executionError { color: var(--danger); }
    .outcome-cantTell, .outcome-untested { color: var(--warning); }
    .outcome-passed { color: var(--success); }
    @media (prefers-color-scheme: dark) { :root { --danger: #ffb4ab; --warning: #ffd19a; --success: #8ee3a8; } }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; } }
    @media print { .skip { display: none; } details { display: block; } }
  </style>
</head>
<body>
  <a class="skip" href="#findings">Skip to findings</a>
  <header>
    <h1>Accessibility report</h1>
    <p><strong>${escapeHtml(run.project.name)}</strong> — ${escapeHtml(run.profile)}</p>
    <p>Run <code>${escapeHtml(run.id)}</code>, completed ${escapeHtml(run.endedAt)}</p>
  </header>
  <main>
    <section aria-labelledby="summary-heading">
      <h2 id="summary-heading">Summary</h2>
      <div class="summary">
        <div class="card ${run.gate.passed ? 'gate-pass' : 'gate-fail'}"><span>Gate</span><strong>${run.gate.passed ? 'PASS' : escapeHtml(run.gate.reason)}</strong><span>Exit ${run.gate.exitCode}</span></div>
        <div class="card"><span>Applicable surfaces</span><strong>${run.surfaceCount}</strong></div>
        <div class="card"><span>Total findings</span><strong>${run.summary.total}</strong></div>
        <div class="card"><span>Suppressed</span><strong>${run.summary.suppressed}</strong></div>
      </div>
    </section>
    <section id="findings" aria-labelledby="findings-heading" tabindex="-1">
      <h2 id="findings-heading">Findings</h2>
      <div class="table-wrap">
        <table>
          <caption>Accessibility findings and evidence</caption>
          <thead><tr><th scope="col">Outcome</th><th scope="col">Severity</th><th scope="col">Rule</th><th scope="col">Location</th><th scope="col">Details</th></tr></thead>
          <tbody>${rows || '<tr><td>passed</td><td>advisory</td><td><code>wcag-auditor/run</code></td><td>—</td><td>No findings were emitted.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>
`;
}

function location(finding) {
  const base = finding.target.file ?? finding.target.routeOrScene ?? finding.target.state ?? '—';
  const position = finding.target.line ? `:${finding.target.line}${finding.target.column ? `:${finding.target.column}` : ''}` : '';
  const selector = finding.target.selectorOrNode ? ` — ${finding.target.selectorOrNode}` : '';
  return `${base}${position}${selector}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}
