import { getBuiltinAdapters } from '../adapters/index.mjs';
import { runReporters } from '../reporters/index.mjs';
import {
  RUN_SCHEMA_VERSION,
  TOOLKIT_NAME,
  TOOLKIT_VERSION
} from './constants.mjs';
import { normalizeConfig } from './config.mjs';
import { createProjectImporter } from './dependencies.mjs';
import { DependencyError } from './errors.mjs';
import { evaluateGate } from './gate.mjs';
import { createRunId } from './hash.mjs';
import { toJsonSafe } from './json.mjs';
import { normalizeFinding, summarizeFindings } from './result.mjs';
import { enrichFindingsWithSourceLocations } from './source-locate.mjs';
import { applySuppressions } from './suppressions.mjs';

export async function runAccessibility(inputConfig, options = {}) {
  const config = options.configIsNormalized
    ? inputConfig
    : normalizeConfig(inputConfig, { cwd: options.cwd });
  const now = options.now instanceof Date ? options.now : new Date();
  const startedWallClock = Date.now();
  const runId = options.runId ?? createRunId(now);
  const adapters = { ...getBuiltinAdapters(), ...(options.adapters ?? {}) };
  const projectImporter = options.importModule ?? createProjectImporter(config.project.root);
  const rawFindings = [];
  const adapterRuns = [];
  let surfaceCount = 0;

  for (const adapterConfig of config.adapters) {
    const started = Date.now();
    const adapter = adapters[adapterConfig.type];
    if (typeof adapter !== 'function') {
      rawFindings.push(adapterExecutionFinding(adapterConfig, `No adapter is registered for type "${adapterConfig.type}"`));
      adapterRuns.push(adapterRun(adapterConfig, 'failed', 0, 1, started));
      continue;
    }

    const adapterContext = {
      runId,
      now,
      projectName: config.project.name,
      projectRoot: config.project.root,
      outputDirectory: config.outputDirectory,
      adapterName: adapterConfig.id,
      profile: config.profile,
      metadata: toJsonSafe(config.metadata, 'run metadata'),
      importModule: projectImporter,
      modules: options.modules
    };

    try {
      const result = await adapter(adapterConfig, adapterContext);
      validateAdapterResult(result, adapterConfig.id);
      const adapterMetadata = toJsonSafe(result.metadata ?? {}, `adapter ${adapterConfig.id} metadata`);
      surfaceCount += result.surfaceCount;
      rawFindings.push(...result.findings);
      adapterRuns.push({
        ...adapterRun(adapterConfig, 'completed', result.surfaceCount, result.findings.length, started),
        metadata: adapterMetadata
      });
    } catch (error) {
      if (error instanceof DependencyError && adapterConfig.required === false) {
        adapterRuns.push({
          ...adapterRun(adapterConfig, 'skipped', 0, 0, started),
          metadata: { reason: error.message, code: error.code }
        });
        continue;
      }
      rawFindings.push(adapterExecutionFinding(adapterConfig, error.message, error));
      adapterRuns.push({
        ...adapterRun(adapterConfig, 'failed', 0, 1, started),
        metadata: { error: error.message, code: error.code }
      });
    }
  }

  let findings = normalizeAll(rawFindings, {
    runId,
    projectName: config.project.name
  });
  findings = enrichFindingsWithSourceLocations(findings, {
    projectRoot: config.project.root
  });

  const suppressionResult = applySuppressions(findings, config.suppressions, now);
  findings = suppressionResult.findings;
  findings.push(...normalizeGovernanceFindings(suppressionResult, {
    runId,
    projectName: config.project.name
  }));

  if (surfaceCount < 1) {
    findings.push(normalizeFinding({
      ruleId: 'wcag-auditor/system/no-applicable-surface',
      title: 'No applicable accessibility surface was tested',
      description: 'The configured adapters did not evaluate any files, routes, scenes, states, or manual checks.',
      outcome: 'executionError',
      severity: 'serious',
      confidence: 'high',
      automation: 'automatic',
      target: { adapter: 'runner' },
      standards: [{ document: 'INTERNAL', requirement: 'applicable-test-surface', mapping: 'policy' }],
      remediation: 'Correct the adapter configuration and verify that the intended application surfaces are reachable.',
      tags: ['configuration', 'execution']
    }, {
      runId,
      projectName: config.project.name,
      adapterName: 'runner'
    }));
  }

  const elapsedMs = Math.max(0, Date.now() - startedWallClock);
  const endedAt = new Date(now.getTime() + elapsedMs);
  const run = {
    schemaVersion: RUN_SCHEMA_VERSION,
    id: runId,
    toolkit: { name: TOOLKIT_NAME, version: TOOLKIT_VERSION },
    project: config.project,
    profile: config.profile,
    startedAt: now.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: elapsedMs,
    outputDirectory: config.outputDirectory,
    surfaceCount,
    adapters: adapterRuns,
    findings,
    summary: summarizeFindings(findings),
    gate: null,
    metadata: toJsonSafe(config.metadata, 'run metadata'),
    reportFiles: []
  };
  run.gate = evaluateGate(run, config.gate);
  run.reportFiles = await runReporters(run, config.reporters, {
    quiet: options.quiet,
    color: options.color,
    stream: options.stream
  });
  return run;
}

function normalizeAll(rawFindings, context) {
  const normalized = [];
  for (const raw of rawFindings) {
    const adapterName = raw.target?.adapter ?? 'unknown';
    try {
      normalized.push(normalizeFinding(raw, { ...context, adapterName }));
    } catch (error) {
      normalized.push(normalizeFinding({
        ruleId: 'wcag-auditor/system/adapter-execution',
        title: 'Adapter returned an invalid finding',
        description: error.message,
        outcome: 'executionError',
        severity: 'serious',
        confidence: 'high',
        automation: 'automatic',
        target: { adapter: adapterName },
        standards: [{ document: 'INTERNAL', requirement: 'adapter-execution', mapping: 'policy' }],
        evidence: { invalidFinding: safeJson(raw), error: error.message },
        remediation: 'Correct the adapter finding contract.',
        tags: ['adapter-contract', 'execution']
      }, { ...context, adapterName }));
    }
  }
  return normalized;
}

function normalizeGovernanceFindings(result, context) {
  const findings = [];
  for (const suppression of result.expired) {
    findings.push(normalizeFinding({
      ruleId: 'wcag-auditor/governance/suppression-expired',
      title: 'Accessibility suppression expired',
      outcome: 'failed',
      severity: 'serious',
      confidence: 'high',
      automation: 'automatic',
      target: { adapter: 'runner', routeOrScene: suppression.routeOrScene, state: suppression.state },
      standards: [{ document: 'INTERNAL', requirement: 'suppression-governance', mapping: 'policy' }],
      evidence: suppression,
      remediation: 'Remove the suppression or renew it only after a documented accessibility review.',
      tags: ['governance', 'suppression']
    }, { ...context, adapterName: 'runner' }));
  }
  for (const invalid of result.invalid) {
    findings.push(normalizeFinding({
      ruleId: 'wcag-auditor/governance/suppression-invalid',
      title: 'Accessibility suppression is invalid',
      description: invalid.problem,
      outcome: 'executionError',
      severity: 'serious',
      confidence: 'high',
      automation: 'automatic',
      target: { adapter: 'runner' },
      standards: [{ document: 'INTERNAL', requirement: 'suppression-governance', mapping: 'policy' }],
      evidence: invalid.suppression,
      remediation: 'Correct or remove the malformed suppression record.',
      tags: ['governance', 'suppression']
    }, { ...context, adapterName: 'runner' }));
  }
  return findings;
}

function adapterExecutionFinding(adapterConfig, message, error) {
  return {
    ruleId: 'wcag-auditor/system/adapter-execution',
    title: 'Accessibility adapter execution failed',
    description: message,
    outcome: 'executionError',
    severity: 'serious',
    confidence: 'high',
    automation: 'automatic',
    target: { adapter: adapterConfig.id },
    standards: [{ document: 'INTERNAL', requirement: 'adapter-execution', mapping: 'policy' }],
    evidence: {
      adapterType: adapterConfig.type,
      code: error?.code,
      details: error?.details
    },
    remediation: 'Correct the adapter configuration, dependency, or test environment and rerun the gate.',
    tags: ['adapter', 'execution']
  };
}

function adapterRun(config, status, surfaces, findings, started) {
  return {
    id: config.id,
    type: config.type,
    required: config.required,
    status,
    surfaceCount: surfaces,
    findingCount: findings,
    durationMs: Date.now() - started,
    metadata: {}
  };
}

function validateAdapterResult(result, adapterName) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError(`Adapter ${adapterName} must return an object`);
  }
  if (!Array.isArray(result.findings)) throw new TypeError(`Adapter ${adapterName} must return findings[]`);
  if (!Number.isInteger(result.surfaceCount) || result.surfaceCount < 0) {
    throw new TypeError(`Adapter ${adapterName} must return a non-negative integer surfaceCount`);
  }
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}
