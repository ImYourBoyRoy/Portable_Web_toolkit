import path from 'node:path';
import { NATIVE_EVIDENCE_SCHEMA_VERSION, OUTCOMES, SEVERITIES } from '../core/constants.mjs';
import { AdapterError } from '../core/errors.mjs';
import { normalizePath, readJsonFile } from '../core/filesystem.mjs';

export async function runNativeEvidenceAdapter(config, context) {
  const configuredFiles = Array.isArray(config.files) ? config.files : [config.file].filter(Boolean);
  if (configuredFiles.length === 0) throw new AdapterError('native-evidence adapter requires file or files');

  const findings = [];
  let surfaceCount = 0;
  const producers = [];
  for (const configuredFile of configuredFiles) {
    const file = path.resolve(context.projectRoot, configuredFile);
    const document = await readJsonFile(file);
    const parsed = parseNativeEvidenceDocument(document, { file });
    producers.push(parsed.producer);
    surfaceCount += parsed.surfaceCount;
    for (const finding of parsed.findings) {
      findings.push({
        ...finding,
        target: {
          ...finding.target,
          adapter: context.adapterName,
          file: normalizePath(finding.target?.file ?? path.relative(context.projectRoot, file))
        },
        tags: ['native-evidence', parsed.producer.kind, ...(finding.tags ?? [])]
      });
    }
  }
  return { findings, surfaceCount, metadata: { producers } };
}

export function parseNativeEvidenceDocument(document, options = {}) {
  const errors = validateNativeEvidenceDocument(document);
  if (errors.length > 0) {
    throw new AdapterError(`Invalid native evidence${options.file ? ` in ${options.file}` : ''}:\n- ${errors.join('\n- ')}`, {
      file: options.file,
      errors
    });
  }
  return {
    producer: document.producer,
    surfaceCount: document.surfaceCount ?? document.findings.length,
    findings: document.findings
  };
}

export function validateNativeEvidenceDocument(document) {
  const errors = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) return ['document must be an object'];
  if (document.schemaVersion !== NATIVE_EVIDENCE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must equal ${NATIVE_EVIDENCE_SCHEMA_VERSION}`);
  }
  if (!document.producer || typeof document.producer !== 'object') {
    errors.push('producer is required');
  } else {
    for (const field of ['name', 'version', 'kind']) {
      if (typeof document.producer[field] !== 'string' || document.producer[field].trim() === '') {
        errors.push(`producer.${field} is required`);
      }
    }
  }
  if (!Array.isArray(document.findings)) {
    errors.push('findings must be an array');
    return errors;
  }
  if (document.surfaceCount !== undefined && (!Number.isInteger(document.surfaceCount) || document.surfaceCount < 0)) {
    errors.push('surfaceCount must be a non-negative integer');
  }
  document.findings.forEach((finding, index) => {
    const prefix = `findings[${index}]`;
    if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    for (const field of ['ruleId', 'title', 'outcome', 'severity']) {
      if (typeof finding[field] !== 'string' || finding[field].trim() === '') errors.push(`${prefix}.${field} is required`);
    }
    if (!OUTCOMES.includes(finding.outcome)) errors.push(`${prefix}.outcome is invalid`);
    if (!SEVERITIES.includes(finding.severity)) errors.push(`${prefix}.severity is invalid`);
  });
  return errors;
}
