import { EXIT_CODES } from './constants.mjs';

export function evaluateGate(run, gate) {
  const active = run.findings.filter((finding) => !finding.suppressed);
  const executionErrors = active.filter((finding) => finding.outcome === 'executionError');
  const unresolved = active.filter((finding) => gate.unresolvedOutcomes.includes(finding.outcome));
  const blocking = active.filter((finding) => gate.failOnOutcomes.includes(finding.outcome)
    && gate.failOnSeverities.includes(finding.severity));

  if (gate.executionErrors === 'error' && executionErrors.length > 0) {
    return result(EXIT_CODES.EXECUTION_ERROR, 'executionError', executionErrors);
  }
  if (gate.requireApplicableSurface && run.surfaceCount < 1) {
    return result(EXIT_CODES.EXECUTION_ERROR, 'noApplicableSurface', []);
  }
  if (gate.unresolvedEvidence === 'error' && unresolved.length > 0) {
    return result(EXIT_CODES.UNRESOLVED_EVIDENCE, 'unresolvedEvidence', unresolved);
  }
  if (blocking.length > 0) {
    return result(EXIT_CODES.BLOCKING_FINDINGS, 'blockingFindings', blocking);
  }
  return result(EXIT_CODES.PASS, 'passed', []);
}

function result(exitCode, reason, findings) {
  return {
    passed: exitCode === EXIT_CODES.PASS,
    exitCode,
    reason,
    blockingFingerprints: findings.map((finding) => finding.fingerprint)
  };
}
