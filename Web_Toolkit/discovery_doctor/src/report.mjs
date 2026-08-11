// ./Web_Toolkit/discovery_doctor/src/report.mjs
/**
 * Result accumulator for discovery-doctor.
 */

export function createReport() {
  return {
    results: [],
    counts: { pass: 0, fail: 0, warn: 0, info: 0 }
  };
}

export function addResult(report, status, label, detail = '') {
  const entry = { status, label, detail };
  report.results.push(entry);
  report.counts[status] = (report.counts[status] || 0) + 1;
  const pad = String(label).padEnd(28);
  const prefix = status.toUpperCase();
  const message = detail ? `[${prefix}] ${pad}: ${detail}` : `[${prefix}] ${pad}`;
  if (status === 'fail') console.warn(message);
  else if (status === 'warn') console.warn(message);
  else console.log(message);
  return entry;
}

export function exitCodeForReport(report, { strict = false } = {}) {
  if ((report.counts.fail || 0) > 0) return 2;
  if (strict && (report.counts.warn || 0) > 0) return 2;
  return 0;
}
