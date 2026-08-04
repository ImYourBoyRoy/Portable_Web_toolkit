process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  producer: { name: 'fixture-producer', version: '1.0.0', kind: 'test-command' },
  surfaceCount: 1,
  findings: [{
    ruleId: 'fixture/rule',
    title: 'Fixture rule',
    outcome: 'passed',
    severity: 'advisory',
    evidence: { message: 'Command completed' }
  }]
})}\n`);
