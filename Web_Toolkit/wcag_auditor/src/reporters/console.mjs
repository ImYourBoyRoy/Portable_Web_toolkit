import { TOOLKIT_NAME, TOOLKIT_VERSION } from '../core/constants.mjs';

export function renderConsoleReport(run, options = {}) {
  const useColor = options.color ?? (process.stdout.isTTY && !process.env.NO_COLOR);
  const paint = createPainter(useColor);
  const lines = [];
  lines.push(`${paint.bold(`${TOOLKIT_NAME} ${TOOLKIT_VERSION}`)} — ${run.project.name}`);
  lines.push(`Run ${run.id} | profile ${run.profile} | surfaces ${run.surfaceCount} | findings ${run.summary.total}`);
  lines.push(`Gate: ${formatGate(run.gate, paint)}`);
  lines.push('');

  const active = run.findings.filter((finding) => !finding.suppressed && finding.outcome !== 'passed' && finding.outcome !== 'inapplicable');
  if (active.length === 0) {
    lines.push(paint.green('No active failed, unresolved, or execution-error findings.'));
  } else {
    for (const finding of active) {
      const location = formatLocation(finding.target);
      lines.push(`${outcomeLabel(finding.outcome, paint)} ${paint.bold(finding.ruleId)} [${finding.severity}]${location ? ` — ${location}` : ''}`);
      lines.push(`  ${finding.title}`);
      if (finding.description) lines.push(`  ${singleLine(finding.description)}`);
      if (finding.remediation) lines.push(`  Fix: ${singleLine(finding.remediation)}`);
      lines.push(`  Fingerprint: ${finding.fingerprint}`);
    }
  }

  const suppressed = run.findings.filter((finding) => finding.suppressed);
  if (suppressed.length > 0) {
    lines.push('');
    lines.push(paint.yellow(`${suppressed.length} finding(s) suppressed with active governance records.`));
  }
  if (run.reportFiles?.length) {
    lines.push('');
    lines.push(`Reports: ${run.reportFiles.join(', ')}`);
    const dashboard = run.reportFiles.find((file) => String(file).includes('wcag-audit-dashboard.html'));
    if (dashboard) {
      lines.push('');
      lines.push(paint.bold(`Stakeholder dashboard (share this): ${dashboard}`));
    }
  }
  return `${lines.join('\n')}\n`;
}

export function writeConsoleReport(run, options = {}) {
  const output = renderConsoleReport(run, options);
  (options.stream ?? process.stdout).write(output);
  return null;
}

function formatGate(gate, paint) {
  if (gate.passed) return paint.green('PASS');
  if (gate.reason === 'blockingFindings') return paint.red(`FAIL (exit ${gate.exitCode}, blocking findings)`);
  if (gate.reason === 'unresolvedEvidence') return paint.yellow(`UNRESOLVED (exit ${gate.exitCode})`);
  return paint.red(`ERROR (exit ${gate.exitCode}, ${gate.reason})`);
}

function outcomeLabel(outcome, paint) {
  const labels = {
    failed: paint.red('FAIL'),
    executionError: paint.red('ERROR'),
    cantTell: paint.yellow('REVIEW'),
    untested: paint.yellow('UNTESTED'),
    passed: paint.green('PASS'),
    inapplicable: 'N/A'
  };
  return labels[outcome] ?? outcome.toUpperCase();
}

function formatLocation(target) {
  if (target?.file) {
    const position = target.line ? `:${target.line}${target.column ? `:${target.column}` : ''}` : '';
    const selector = target.selectorOrNode ? ` (${target.selectorOrNode})` : '';
    return `${target.file}${position}${selector}`;
  }
  const location = target.routeOrScene ?? target.state ?? '';
  const selector = target.selectorOrNode ? ` (${target.selectorOrNode})` : '';
  const hint = target.sourceHint ? ` [${target.sourceHint}]` : '';
  return `${location}${selector}${hint}`;
}

function singleLine(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function createPainter(enabled) {
  const wrap = (code) => (value) => enabled ? `\u001b[${code}m${value}\u001b[0m` : value;
  return {
    bold: wrap('1'),
    red: wrap('31'),
    green: wrap('32'),
    yellow: wrap('33')
  };
}
