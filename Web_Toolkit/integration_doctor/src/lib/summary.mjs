// ./Web_Toolkit/integration_doctor/src/lib/summary.mjs
/**
 * Summary and markdown helpers for integration-doctor.
 */

function pushIssue(issues, condition, message) {
  if (condition) issues.push(message);
}

export function summarizeReport(report = {}) {
  const issues = [];
  const env = report.env || {};
  pushIssue(issues, !env.envExampleExists, 'Project .env.example is missing or empty.');
  pushIssue(issues, env.cloudflareTokenSource === 'missing', 'No CLOUDFLARE_API_TOKEN was found in the project root .env, optional Web_Toolkit/.env, or shell env.');

  for (const integration of report.integrations || []) {
    if (!integration.required) continue;
    const label = integration.label || `${integration.category}.${integration.name}`;
    pushIssue(issues, integration.env?.missing?.length > 0, `${label} is missing env keys: ${integration.env.missing.join(', ')}`);
    pushIssue(issues, integration.env?.missingFromExample?.length > 0, `${label} is missing keys from .env.example: ${integration.env.missingFromExample.join(', ')}`);
    pushIssue(issues, integration.env?.portableOnly?.length > 0, `${label} keys only exist in Web_Toolkit/.env; prefer the target project root .env for site secrets.`);
    pushIssue(issues, integration.live?.checked && !integration.live?.ok, `${label} live markers were not detected at ${integration.live.path}.`);
    pushIssue(issues, Number(integration.emailAudit?.warningsCount || 0) > 0, `${label} has ${integration.emailAudit.warningsCount} email audit warning(s).`);
  }

  return {
    overall: issues.length > 0 ? 'warn' : 'pass',
    issues,
    metrics: {
      requiredIntegrations: (report.integrations || []).filter((entry) => entry.required).length,
      integrationsWithIssues: (report.integrations || []).filter((entry) => entry.required && ((entry.env?.missing?.length || 0) > 0 || (entry.env?.missingFromExample?.length || 0) > 0 || (entry.env?.portableOnly?.length || 0) > 0 || (entry.live?.checked && !entry.live?.ok) || Number(entry.emailAudit?.warningsCount || 0) > 0)).length
    }
  };
}

export function renderMarkdown(report = {}, summary = summarizeReport(report)) {
  const lines = [
    '# Integration Doctor',
    '',
    `- Checked at: ${report.checkedAt}`,
    `- Profile: ${report.profile}`,
    `- Project root: ${report.projectRoot}`,
    `- Overall: ${summary.overall.toUpperCase()}`,
    '',
    '## Environment Sources',
    '',
    `- Project .env.example present: ${Boolean(report.env?.envExampleExists)}`,
    `- Project .env present: ${Boolean(report.env?.envExists)}`,
    `- Optional portable .env present: ${Boolean(report.env?.portableEnvExists)}`,
    `- Cloudflare token source: ${report.env?.cloudflareTokenSource || 'missing'}`,
    '',
    '## Integration Status',
    '',
    '| Integration | Required | Env OK | Live OK | Notes |',
    '| --- | --- | --- | --- | --- |'
  ];
  for (const integration of report.integrations || []) {
    const notes = [];
    if (integration.env?.missing?.length) notes.push(`missing env: ${integration.env.missing.join(', ')}`);
    if (integration.env?.missingFromExample?.length) notes.push(`missing from example: ${integration.env.missingFromExample.join(', ')}`);
    if (integration.env?.portableOnly?.length) notes.push(`portable only: ${integration.env.portableOnly.join(', ')}`);
    if (integration.live?.checked && !integration.live?.ok) notes.push('live markers missing');
    if (Number(integration.emailAudit?.warningsCount || 0) > 0) notes.push(`email warnings: ${integration.emailAudit.warningsCount}`);
    lines.push(`| ${integration.label} | ${integration.required} | ${integration.env?.ok !== false} | ${integration.live?.checked ? integration.live.ok : 'n/a'} | ${notes.join('; ') || 'ok'} |`);
  }
  lines.push('', '## Issues', '');
  if (summary.issues.length === 0) {
    lines.push('- No issues detected.');
  } else {
    for (const issue of summary.issues) lines.push(`- ${issue}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}





