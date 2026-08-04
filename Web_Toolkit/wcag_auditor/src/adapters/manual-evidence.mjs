import path from 'node:path';
import { EVIDENCE_SCHEMA_VERSION, OUTCOMES, SEVERITIES } from '../core/constants.mjs';
import { parseIsoDateTime } from '../core/dates.mjs';
import { AdapterError } from '../core/errors.mjs';
import { normalizePath, readJsonFile } from '../core/filesystem.mjs';

export async function runManualEvidenceAdapter(config, context) {
  if (typeof config.file !== 'string' || config.file.trim() === '') {
    throw new AdapterError('manual-evidence adapter requires a file path');
  }
  const file = path.resolve(context.projectRoot, config.file);
  const document = await readJsonFile(file);
  const errors = validateEvidenceDocument(document);
  if (errors.length > 0) {
    throw new AdapterError(`Invalid manual evidence file ${file}:\n- ${errors.join('\n- ')}`, { file, errors });
  }
  if (document.project && document.project !== context.projectName && config.allowProjectMismatch !== true) {
    throw new AdapterError(
      `Manual evidence project "${document.project}" does not match "${context.projectName}"`,
      { file }
    );
  }

  const findings = [];
  const relativeFile = normalizePath(path.relative(context.projectRoot, file));
  for (const check of document.checks) {
    const testedAt = check.testedAt ? parseIsoDateTime(check.testedAt) : null;
    if (testedAt !== null && testedAt > context.now.getTime()) {
      throw new AdapterError(`Manual evidence check "${check.id}" has a future testedAt timestamp`, { file, checkId: check.id });
    }
    const expiresAt = check.expiresAt ? parseIsoDateTime(check.expiresAt) : null;
    const expired = expiresAt !== null && expiresAt <= context.now.getTime();
    findings.push({
      ruleId: `manual/${check.id}`,
      ruleVersion: check.ruleVersion ?? '1.0.0',
      title: check.title,
      description: check.notes ?? '',
      outcome: expired ? 'untested' : check.outcome,
      severity: check.severity,
      confidence: 'high',
      automation: 'manual',
      target: {
        adapter: context.adapterName,
        routeOrScene: check.routeOrScene,
        state: check.state,
        file: relativeFile
      },
      standards: check.standards ?? [],
      evidence: {
        tester: check.tester,
        testedAt: check.testedAt,
        expiresAt: check.expiresAt,
        environment: check.environment,
        evidence: check.evidence,
        notes: check.notes
      },
      remediation: check.remediation ?? '',
      tags: ['manual-evidence', ...(check.tags ?? [])]
    });

    if (expired) {
      findings.push({
        ruleId: 'wcag-auditor/evidence/expired',
        title: 'Manual accessibility evidence expired',
        outcome: 'failed',
        severity: check.severity,
        confidence: 'high',
        automation: 'automatic',
        target: {
          adapter: context.adapterName,
          routeOrScene: check.routeOrScene,
          state: check.state,
          file: relativeFile
        },
        standards: [{ document: 'INTERNAL', requirement: 'manual-evidence-freshness', mapping: 'policy' }],
        evidence: { checkId: check.id, expiresAt: check.expiresAt },
        remediation: 'Repeat the manual check and replace the expired evidence.',
        tags: ['governance', 'manual-evidence']
      });
    }
  }

  return {
    findings,
    surfaceCount: document.checks.length,
    metadata: { file, updatedAt: document.updatedAt ?? null }
  };
}

export function validateEvidenceDocument(document) {
  const errors = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) return ['document must be an object'];
  if (document.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must equal ${EVIDENCE_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(document.checks) || document.checks.length === 0) {
    errors.push('checks must be a non-empty array');
    return errors;
  }
  if (document.updatedAt !== undefined && parseIsoDateTime(document.updatedAt) === null) {
    errors.push('updatedAt must be an ISO date-time');
  }

  const ids = new Set();
  document.checks.forEach((check, index) => {
    const prefix = `checks[${index}]`;
    if (!check || typeof check !== 'object' || Array.isArray(check)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    for (const field of ['id', 'title', 'severity', 'outcome', 'tester', 'environment']) {
      if (typeof check[field] !== 'string' || check[field].trim() === '') errors.push(`${prefix}.${field} is required`);
    }
    if (typeof check.id === 'string') {
      if (ids.has(check.id)) errors.push(`${prefix}.id must be unique`);
      ids.add(check.id);
    }
    if (!OUTCOMES.includes(check.outcome)) errors.push(`${prefix}.outcome is invalid`);
    if (!SEVERITIES.includes(check.severity)) errors.push(`${prefix}.severity is invalid`);
    if (['passed', 'failed'].includes(check.outcome)) {
      if (parseIsoDateTime(check.testedAt) === null) errors.push(`${prefix}.testedAt is required and must be an ISO date-time`);
      if (typeof check.evidence !== 'string' || check.evidence.trim() === '') errors.push(`${prefix}.evidence is required for passed or failed checks`);
      if (parseIsoDateTime(check.expiresAt) === null) errors.push(`${prefix}.expiresAt is required and must be an ISO date-time for passed or failed checks`);
    } else if (check.testedAt && parseIsoDateTime(check.testedAt) === null) {
      errors.push(`${prefix}.testedAt must be an ISO date-time or null`);
    }
    if (check.expiresAt && parseIsoDateTime(check.expiresAt) === null) errors.push(`${prefix}.expiresAt must be an ISO date-time or null`);
    if (parseIsoDateTime(check.testedAt) !== null && parseIsoDateTime(check.expiresAt) !== null
      && parseIsoDateTime(check.expiresAt) <= parseIsoDateTime(check.testedAt)) {
      errors.push(`${prefix}.expiresAt must be after testedAt`);
    }
    if (check.standards !== undefined && !Array.isArray(check.standards)) errors.push(`${prefix}.standards must be an array`);
  });
  return errors;
}
