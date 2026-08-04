export function renderSarifReport(run) {
  const rules = new Map();
  for (const finding of run.findings) {
    if (!rules.has(finding.ruleId)) {
      rules.set(finding.ruleId, {
        id: finding.ruleId,
        name: sarifName(finding.ruleId),
        shortDescription: { text: finding.title },
        fullDescription: finding.description ? { text: finding.description } : undefined,
        helpUri: finding.helpUrl,
        properties: {
          tags: finding.tags,
          standards: finding.standards,
          automation: finding.automation
        }
      });
    }
  }

  const results = run.findings.map((finding) => ({
    ruleId: finding.ruleId,
    level: sarifLevel(finding),
    message: { text: sarifMessage(finding) },
    fingerprints: { 'wcag-auditor/v1': finding.fingerprint },
    locations: [sarifLocation(finding)],
    suppressions: finding.suppressed ? [{ kind: 'external', justification: finding.suppression?.justification }] : undefined,
    properties: {
      outcome: finding.outcome,
      severity: finding.severity,
      confidence: finding.confidence,
      evidence: finding.evidence,
      standards: finding.standards
    }
  }));

  return `${JSON.stringify({
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: {
        driver: {
          name: 'portable-wcag-auditor',
          version: run.toolkit.version,
          informationUri: 'https://www.w3.org/WAI/standards-guidelines/wcag/',
          rules: [...rules.values()]
        }
      },
      automationDetails: { id: run.id },
      invocations: [{
        executionSuccessful: !run.findings.some((finding) => finding.outcome === 'executionError'),
        exitCode: run.gate.exitCode
      }],
      results,
      properties: {
        project: run.project,
        profile: run.profile,
        gate: run.gate,
        surfaceCount: run.surfaceCount
      }
    }]
  }, null, 2)}\n`;
}

function sarifName(ruleId) {
  return ruleId.replace(/[^a-zA-Z0-9]+/g, ' ').trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sarifLevel(finding) {
  if (finding.suppressed || ['passed', 'inapplicable'].includes(finding.outcome)) return 'none';
  if (finding.outcome === 'executionError' || ['critical', 'serious'].includes(finding.severity)) return 'error';
  if (finding.outcome === 'failed' || ['moderate', 'minor'].includes(finding.severity)) return 'warning';
  return 'note';
}

function sarifMessage(finding) {
  const parts = [finding.title];
  if (finding.description) parts.push(finding.description);
  if (finding.remediation) parts.push(`Remediation: ${finding.remediation}`);
  return parts.join(' ');
}

function sarifLocation(finding) {
  const uri = finding.target.file
    ?? `a11y://${encodeURIComponent(finding.target.adapter)}/${encodeURIComponent(finding.target.routeOrScene ?? 'surface')}`;
  return {
    physicalLocation: {
      artifactLocation: { uri },
      region: finding.target.line ? {
        startLine: finding.target.line,
        startColumn: finding.target.column ?? 1
      } : undefined
    },
    logicalLocations: finding.target.selectorOrNode ? [{ name: finding.target.selectorOrNode }] : undefined
  };
}
