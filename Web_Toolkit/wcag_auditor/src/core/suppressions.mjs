import { parseIsoDateTime } from './dates.mjs';

export function applySuppressions(findings, suppressions = [], now = new Date()) {
  const expired = [];
  const invalid = [];
  const usable = [];

  for (const suppression of suppressions) {
    const problem = validateSuppression(suppression, now);
    if (problem) {
      invalid.push({ suppression, problem });
      continue;
    }
    if (parseIsoDateTime(suppression.expiresAt) <= now.getTime()) {
      expired.push(suppression);
      continue;
    }
    usable.push(suppression);
  }

  const applied = findings.map((finding) => {
    if (finding.outcome !== 'failed') return finding;
    const match = usable.find((suppression) => matchesSuppression(finding, suppression));
    if (!match) return finding;
    return {
      ...finding,
      suppressed: true,
      suppression: {
        justification: match.justification,
        owner: match.owner,
        ticket: match.ticket,
        createdAt: match.createdAt,
        expiresAt: match.expiresAt
      }
    };
  });

  return { findings: applied, expired, invalid };
}

export function validateSuppression(value, now) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'suppression must be an object';
  if (!value.fingerprint && !value.ruleId) return 'fingerprint or ruleId is required';
  for (const field of ['justification', 'owner', 'ticket', 'createdAt', 'expiresAt']) {
    if (typeof value[field] !== 'string' || value[field].trim() === '') return `${field} is required`;
  }
  const createdAt = parseIsoDateTime(value.createdAt);
  const expiresAt = parseIsoDateTime(value.expiresAt);
  if (createdAt === null) return 'createdAt must be an ISO date-time';
  if (expiresAt === null) return 'expiresAt must be an ISO date-time';
  if (expiresAt <= createdAt) return 'expiresAt must be after createdAt';
  if (now instanceof Date && createdAt > now.getTime()) return 'createdAt must not be in the future';
  return null;
}

function matchesSuppression(finding, suppression) {
  if (suppression.fingerprint) return suppression.fingerprint === finding.fingerprint;
  return suppression.ruleId === finding.ruleId
    && (!suppression.adapter || suppression.adapter === finding.target.adapter)
    && (!suppression.routeOrScene || suppression.routeOrScene === finding.target.routeOrScene)
    && (!suppression.state || suppression.state === finding.target.state);
}
