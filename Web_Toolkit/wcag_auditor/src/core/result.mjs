import {
  AUTOMATION_LEVELS,
  CONFIDENCE_LEVELS,
  OUTCOMES,
  SEVERITIES
} from './constants.mjs';
import { stableHash } from './hash.mjs';
import { toJsonSafe } from './json.mjs';

export function normalizeFinding(input, context) {
  const target = {
    project: optionalString(input.target?.project) ?? context.projectName,
    adapter: optionalString(input.target?.adapter) ?? context.adapterName,
    routeOrScene: optionalString(input.target?.routeOrScene),
    state: optionalString(input.target?.state),
    selectorOrNode: normalizeSelector(input.target?.selectorOrNode),
    file: optionalString(input.target?.file),
    line: optionalPositiveInteger(input.target?.line),
    column: optionalPositiveInteger(input.target?.column)
  };

  const finding = {
    runId: context.runId,
    ruleId: requireString(input.ruleId, 'finding.ruleId'),
    ruleVersion: optionalString(input.ruleVersion) ?? '1.0.0',
    title: requireString(input.title ?? input.ruleId, 'finding.title'),
    description: optionalString(input.description) ?? '',
    outcome: validateEnum(input.outcome, OUTCOMES, 'finding.outcome'),
    severity: validateEnum(input.severity ?? 'moderate', SEVERITIES, 'finding.severity'),
    confidence: validateEnum(input.confidence ?? 'medium', CONFIDENCE_LEVELS, 'finding.confidence'),
    automation: validateEnum(input.automation ?? 'automatic', AUTOMATION_LEVELS, 'finding.automation'),
    target,
    standards: normalizeStandards(input.standards),
    evidence: toJsonSafe(input.evidence ?? null, 'finding.evidence'),
    remediation: optionalString(input.remediation) ?? '',
    helpUrl: optionalString(input.helpUrl),
    tags: normalizeTags(input.tags),
    fingerprint: input.fingerprint ?? createFindingFingerprint({ ...input, target }, context),
    suppressed: false,
    suppression: undefined
  };
  return finding;
}

export function createFindingFingerprint(input, context) {
  return stableHash({
    ruleId: input.ruleId,
    adapter: input.target?.adapter ?? context.adapterName,
    routeOrScene: input.target?.routeOrScene ?? '',
    state: input.target?.state ?? '',
    selectorOrNode: normalizeSelector(input.target?.selectorOrNode),
    file: input.target?.file ?? '',
    line: input.target?.line ?? null,
    evidenceKey: compactEvidence(input.evidence)
  }).slice(0, 24);
}

export function summarizeFindings(findings) {
  const outcomes = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]));
  const severities = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  let suppressed = 0;
  for (const finding of findings) {
    outcomes[finding.outcome] += 1;
    severities[finding.severity] += 1;
    if (finding.suppressed) suppressed += 1;
  }
  return {
    total: findings.length,
    outcomes,
    severities,
    suppressed,
    active: findings.length - suppressed
  };
}

function normalizeStandards(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError('finding.standards must be an array');
  return value.map((standard, index) => {
    if (!standard || typeof standard !== 'object') {
      throw new TypeError(`finding.standards[${index}] must be an object`);
    }
    return {
      document: requireString(standard.document, `finding.standards[${index}].document`),
      requirement: requireString(standard.requirement, `finding.standards[${index}].requirement`),
      level: optionalString(standard.level),
      mapping: validateMapping(optionalString(standard.mapping) ?? 'secondary', `finding.standards[${index}].mapping`)
    };
  });
}

function normalizeTags(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError('finding.tags must be an array');
  return [...new Set(value.map((tag) => requireString(tag, 'finding.tags[]')))].sort();
}

function compactEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') return evidence ?? null;
  return {
    id: evidence.id,
    code: evidence.code,
    message: evidence.message,
    html: evidence.html,
    value: evidence.value,
    failureSummary: evidence.failureSummary
  };
}

function normalizeSelector(value) {
  if (Array.isArray(value)) return value.join(' > ');
  return optionalString(value);
}

function optionalString(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new TypeError('Expected a string');
  return value;
}

function optionalPositiveInteger(value) {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || value < 1) throw new TypeError('Expected a positive integer');
  return value;
}


function validateMapping(value, name) {
  if (!['conformance', 'secondary', 'policy'].includes(value)) {
    throw new TypeError(`${name} must be one of: conformance, secondary, policy`);
  }
  return value;
}

function validateEnum(value, allowed, name) {
  if (!allowed.includes(value)) throw new TypeError(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}
