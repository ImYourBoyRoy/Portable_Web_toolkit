// ./Web_Toolkit/wcag_auditor/src/reporters/dashboard.mjs
/**
 * Stakeholder-friendly WCAG audit dashboard (HTML).
 *
 * Emphasizes gate status, unique findings, and file:line locations when known.
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function locationParts(finding) {
  const file = finding.target?.file || '';
  const line = finding.target?.line || '';
  const selector = finding.target?.selectorOrNode || '';
  const hint = finding.target?.sourceHint || '';
  const route = finding.target?.routeOrScene || '';
  return { file, line, selector, hint, route };
}

function locationCell(finding) {
  const { file, line, selector, hint, route } = locationParts(finding);
  if (file) {
    const lineSuffix = line ? `:${line}` : '';
    return `<div class="loc">
      <div class="file"><code>${escapeHtml(file)}${escapeHtml(lineSuffix)}</code></div>
      ${selector ? `<div class="sel"><code>${escapeHtml(selector)}</code></div>` : ''}
      ${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ''}
      ${route ? `<div class="route">Route: ${escapeHtml(route)}</div>` : ''}
    </div>`;
  }
  return `<div class="loc">
    <div class="missing">No source file mapped</div>
    ${selector ? `<div class="sel"><code>${escapeHtml(selector)}</code></div>` : ''}
    ${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ''}
    ${route ? `<div class="route">Route: ${escapeHtml(route)}</div>` : ''}
  </div>`;
}

function countBy(findings, keyFn) {
  const map = new Map();
  for (const finding of findings) {
    const key = keyFn(finding);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function renderDashboardReport(run) {
  const findings = (run.findings || []).filter((f) => !f.suppressed);
  const withFile = findings.filter((f) => f.target?.file).length;
  const fingerprints = new Set(findings.map((f) => f.fingerprint));
  const byRule = countBy(findings, (f) => f.ruleId);
  const bySeverity = countBy(findings, (f) => f.severity);

  const maxRule = Math.max(1, ...byRule.map(([, n]) => n));
  const ruleBars = byRule.map(([rule, count]) => {
    const width = Math.round((count / maxRule) * 100);
    return `<div class="bar-row"><span class="bar-label" title="${escapeHtml(rule)}">${escapeHtml(rule)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${width}%"></span></span>
      <span class="bar-count">${count}</span></div>`;
  }).join('');

  const rows = findings.map((finding, index) => `
    <tr data-severity="${escapeHtml(finding.severity)}" data-outcome="${escapeHtml(finding.outcome)}" data-rule="${escapeHtml(finding.ruleId)}">
      <td>${index + 1}</td>
      <td><span class="badge sev-${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span></td>
      <td><span class="badge out-${escapeHtml(finding.outcome)}">${escapeHtml(finding.outcome)}</span></td>
      <td><code>${escapeHtml(finding.ruleId)}</code><div class="title">${escapeHtml(finding.title)}</div></td>
      <td>${locationCell(finding)}</td>
      <td>${finding.remediation ? escapeHtml(finding.remediation) : '—'}</td>
      <td><code class="fp">${escapeHtml(String(finding.fingerprint || '').slice(0, 12))}</code></td>
    </tr>`).join('');

  const severityPills = bySeverity.map(([name, count]) =>
    `<span class="pill">${escapeHtml(name)}: <strong>${count}</strong></span>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WCAG audit dashboard — ${escapeHtml(run.project?.name || 'site')}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: Canvas; --fg: CanvasText; --muted: GrayText; --line: color-mix(in srgb, CanvasText 18%, Canvas);
      --danger: #8b0000; --warning: #6b3d00; --ok: #006b2d; --card: color-mix(in srgb, CanvasText 4%, Canvas);
      font-family: "Segoe UI", system-ui, sans-serif; line-height: 1.45;
    }
    @media (prefers-color-scheme: dark) {
      :root { --danger: #ffb4ab; --warning: #ffd19a; --ok: #8ee3a8; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--fg); }
    a { color: LinkText; }
    a:focus-visible, button:focus-visible, select:focus-visible { outline: 3px solid Highlight; outline-offset: 2px; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 1.25rem; }
    header h1 { margin: 0 0 .35rem; font-size: 1.75rem; }
    header p { margin: .2rem 0; color: var(--muted); }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr)); gap: .75rem; margin: 1rem 0 1.25rem; }
    .card { border: 1px solid var(--line); background: var(--card); border-radius: .5rem; padding: .85rem; }
    .card .k { color: var(--muted); font-size: .85rem; }
    .card .v { font-size: 1.55rem; font-weight: 700; margin-top: .2rem; }
    .fail { border-inline-start: .4rem solid var(--danger); }
    .pass { border-inline-start: .4rem solid var(--ok); }
    .pills { display: flex; flex-wrap: wrap; gap: .4rem; margin: .75rem 0; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: .15rem .65rem; font-size: .9rem; }
    .bar-row { display: grid; grid-template-columns: minmax(8rem, 14rem) 1fr 2.5rem; gap: .5rem; align-items: center; margin: .35rem 0; }
    .bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .85rem; }
    .bar-track { height: .65rem; background: var(--line); border-radius: 999px; overflow: hidden; }
    .bar-fill { display: block; height: 100%; background: var(--danger); }
    .filters { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0; align-items: end; }
    label { display: grid; gap: .2rem; font-size: .85rem; color: var(--muted); }
    select, button { font: inherit; padding: .35rem .55rem; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: .5rem; }
    table { width: 100%; border-collapse: collapse; min-width: 70rem; }
    th, td { border-bottom: 1px solid var(--line); padding: .55rem .6rem; text-align: left; vertical-align: top; }
    th { background: color-mix(in srgb, CanvasText 8%, Canvas); position: sticky; top: 0; }
    tr:nth-child(even) td { background: color-mix(in srgb, CanvasText 3%, Canvas); }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .86em; }
    .badge { display: inline-block; border: 1px solid currentColor; border-radius: 999px; padding: .05rem .45rem; font-size: .8rem; font-weight: 700; }
    .sev-serious, .sev-critical, .out-failed, .out-executionError { color: var(--danger); }
    .sev-moderate, .out-cantTell, .out-untested { color: var(--warning); }
    .sev-minor, .out-passed { color: var(--ok); }
    .title { color: var(--muted); font-size: .9rem; margin-top: .2rem; }
    .loc .file code { font-weight: 700; }
    .loc .sel, .loc .hint, .loc .route, .loc .missing { color: var(--muted); font-size: .85rem; margin-top: .15rem; }
    .loc .missing { color: var(--warning); }
    .fp { opacity: .8; }
    .note { border: 1px solid var(--line); border-radius: .5rem; padding: .85rem; margin: 1rem 0; }
    @media print {
      .filters, button { display: none !important; }
      .wrap { max-width: none; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>WCAG audit dashboard</h1>
      <p><strong>${escapeHtml(run.project?.name || 'project')}</strong> · profile <code>${escapeHtml(run.profile)}</code></p>
      <p>Run <code>${escapeHtml(run.id)}</code> · ${escapeHtml(run.endedAt)} · evidence gate only (not a conformance certificate)</p>
    </header>

    <section class="cards" aria-label="Summary">
      <div class="card ${run.gate?.passed ? 'pass' : 'fail'}">
        <div class="k">Gate</div>
        <div class="v">${run.gate?.passed ? 'PASS' : escapeHtml(run.gate?.reason || 'FAIL')}</div>
        <div class="k">Exit ${escapeHtml(String(run.gate?.exitCode ?? ''))}</div>
      </div>
      <div class="card"><div class="k">Findings</div><div class="v">${findings.length}</div></div>
      <div class="card"><div class="k">Unique fingerprints</div><div class="v">${fingerprints.size}</div></div>
      <div class="card"><div class="k">With file:line</div><div class="v">${withFile}/${findings.length}</div></div>
      <div class="card"><div class="k">Surfaces</div><div class="v">${escapeHtml(String(run.surfaceCount ?? 0))}</div></div>
    </section>

    <div class="pills">${severityPills || '<span class="pill">No severity breakdown</span>'}</div>

    <section aria-labelledby="rules-h">
      <h2 id="rules-h">Findings by rule</h2>
      ${ruleBars || '<p>No findings.</p>'}
    </section>

    <div class="note">
      <strong>How to use this dashboard:</strong>
      Prefer rows with <code>file:line</code> — open that path in your editor.
      Selectors without a mapped file are still real rendered issues; search the class name in <code>src/</code>.
      Share this HTML file with stakeholders; JSON/SARIF remain available for tools.
    </div>

    <div class="filters">
      <label>Severity
        <select id="sev">
          <option value="all">All</option>
          <option value="critical">critical</option>
          <option value="serious">serious</option>
          <option value="moderate">moderate</option>
          <option value="minor">minor</option>
        </select>
      </label>
      <label>Outcome
        <select id="out">
          <option value="all">All</option>
          <option value="failed">failed</option>
          <option value="cantTell">cantTell</option>
          <option value="untested">untested</option>
        </select>
      </label>
      <button type="button" id="reset">Reset filters</button>
    </div>

    <section aria-labelledby="findings-h">
      <h2 id="findings-h">Findings</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Severity</th><th>Outcome</th><th>Rule</th>
              <th>File / line / selector</th><th>Remediation</th><th>Fingerprint</th>
            </tr>
          </thead>
          <tbody id="tbody">${rows || '<tr><td colspan="7">No findings.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  </div>
  <script>
    const sev = document.getElementById('sev');
    const out = document.getElementById('out');
    const tbody = document.getElementById('tbody');
    function apply() {
      const s = sev.value;
      const o = out.value;
      for (const tr of tbody.querySelectorAll('tr')) {
        const okSev = s === 'all' || tr.dataset.severity === s;
        const okOut = o === 'all' || tr.dataset.outcome === o;
        tr.hidden = !(okSev && okOut);
      }
    }
    sev.addEventListener('change', apply);
    out.addEventListener('change', apply);
    document.getElementById('reset').addEventListener('click', () => {
      sev.value = 'all'; out.value = 'all'; apply();
    });
  </script>
</body>
</html>`;
}
