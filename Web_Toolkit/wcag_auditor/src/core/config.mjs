import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  CONFIG_SCHEMA_VERSION,
  DEFAULT_GATE,
  KNOWN_ADAPTER_TYPES,
  KNOWN_REPORTER_TYPES,
  OUTCOMES,
  SEVERITIES
} from './constants.mjs';
import { ConfigError } from './errors.mjs';
import { pathExists, readJsonFile } from './filesystem.mjs';
import { toJsonSafe, validateJsonSafe } from './json.mjs';
import { validateRelativeOutputFile } from './path-policy.mjs';
import { validateSuppression } from './suppressions.mjs';

const CONFIG_NAMES = ['wcag-auditor.config.mjs', 'wcag-auditor.config.js', 'wcag-auditor.config.json'];

export async function findConfig(startDirectory = process.cwd()) {
  let current = path.resolve(startDirectory);
  while (true) {
    for (const name of CONFIG_NAMES) {
      const candidate = path.join(current, name);
      if (await pathExists(candidate)) return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function loadConfig(configPath, options = {}) {
  const absolute = path.resolve(options.cwd ?? process.cwd(), configPath);
  if (!(await pathExists(absolute))) throw new ConfigError(`Configuration file does not exist: ${absolute}`);

  let raw;
  try {
    if (absolute.endsWith('.json')) {
      raw = await readJsonFile(absolute);
    } else {
      const moduleUrl = `${pathToFileURL(absolute).href}?loaded=${Date.now()}`;
      const imported = await import(moduleUrl);
      raw = imported.default ?? imported.config;
    }
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(`Unable to load configuration ${absolute}: ${error.message}`, undefined, error);
  }
  return normalizeConfig(raw, { configPath: absolute, cwd: options.cwd });
}

export function normalizeConfig(raw, options = {}) {
  const errors = validateConfig(raw);
  if (errors.length > 0) {
    throw new ConfigError(`Invalid accessibility configuration:\n- ${errors.join('\n- ')}`, errors);
  }

  const configDirectory = options.configPath
    ? path.dirname(options.configPath)
    : path.resolve(options.cwd ?? process.cwd());
  const projectRoot = path.resolve(configDirectory, raw.project.root ?? '.');
  const outputDirectory = path.resolve(projectRoot, raw.outputDirectory ?? '.wcag-audit-results');

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    project: {
      name: raw.project.name.trim(),
      root: projectRoot,
      commit: raw.project.commit ?? process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA ?? null
    },
    profile: raw.profile ?? 'wcag22-aa',
    adapters: raw.adapters.map((adapter, index) => ({
      ...adapter,
      id: adapter.id ?? `${adapter.type}-${index + 1}`,
      required: adapter.required ?? true
    })),
    gate: {
      ...DEFAULT_GATE,
      ...(raw.gate ?? {}),
      failOnSeverities: raw.gate?.failOnSeverities ?? [...DEFAULT_GATE.failOnSeverities],
      failOnOutcomes: raw.gate?.failOnOutcomes ?? [...DEFAULT_GATE.failOnOutcomes],
      unresolvedOutcomes: raw.gate?.unresolvedOutcomes ?? [...DEFAULT_GATE.unresolvedOutcomes]
    },
    reporters: raw.reporters ?? [
      { type: 'console' },
      { type: 'json', file: 'wcag-audit.json' }
    ],
    suppressions: raw.suppressions ?? [],
    outputDirectory,
    metadata: toJsonSafe(raw.metadata ?? {}, 'metadata'),
    configPath: options.configPath ?? null
  };
}

export function validateConfig(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['configuration must export an object'];
  rejectUnknownKeys(raw, ['schemaVersion', 'project', 'profile', 'outputDirectory', 'adapters', 'gate', 'reporters', 'suppressions', 'metadata'], 'configuration', errors);
  if (raw.schemaVersion !== CONFIG_SCHEMA_VERSION) errors.push(`schemaVersion must equal ${CONFIG_SCHEMA_VERSION}`);

  if (!raw.project || typeof raw.project !== 'object' || Array.isArray(raw.project)) {
    errors.push('project is required');
  } else {
    rejectUnknownKeys(raw.project, ['name', 'root', 'commit'], 'project', errors);
    if (typeof raw.project.name !== 'string' || raw.project.name.trim() === '') {
      errors.push('project.name must be a non-empty string');
    }
    if (raw.project.root !== undefined && typeof raw.project.root !== 'string') {
      errors.push('project.root must be a string');
    }
    if (raw.project.commit !== undefined && raw.project.commit !== null && typeof raw.project.commit !== 'string') {
      errors.push('project.commit must be a string or null');
    }
  }

  if (raw.profile !== undefined && (typeof raw.profile !== 'string' || raw.profile.trim() === '')) {
    errors.push('profile must be a non-empty string');
  }
  if (raw.outputDirectory !== undefined && (typeof raw.outputDirectory !== 'string' || raw.outputDirectory.trim() === '')) {
    errors.push('outputDirectory must be a non-empty string');
  }
  if (raw.metadata !== undefined) {
    if (!raw.metadata || typeof raw.metadata !== 'object' || Array.isArray(raw.metadata)) {
      errors.push('metadata must be an object');
    } else {
      const metadataProblem = validateJsonSafe(raw.metadata, 'metadata');
      if (metadataProblem) errors.push(metadataProblem);
    }
  }

  if (!Array.isArray(raw.adapters) || raw.adapters.length === 0) {
    errors.push('adapters must contain at least one adapter');
  } else {
    const ids = new Set();
    raw.adapters.forEach((adapter, index) => {
      if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) {
        errors.push(`adapters[${index}] must be an object`);
        return;
      }
      if (!KNOWN_ADAPTER_TYPES.includes(adapter.type)) {
        errors.push(`adapters[${index}].type must be one of: ${KNOWN_ADAPTER_TYPES.join(', ')}`);
      }
      const id = adapter.id ?? `${adapter.type}-${index + 1}`;
      if (typeof id !== 'string' || id.trim() === '') {
        errors.push(`adapters[${index}].id must be a non-empty string`);
      } else {
        if (ids.has(id)) errors.push(`adapter id must be unique: ${id}`);
        ids.add(id);
      }
      if (adapter.required !== undefined && typeof adapter.required !== 'boolean') {
        errors.push(`adapters[${index}].required must be boolean`);
      }
      validateAdapterConfig(adapter, index, errors);
    });
  }

  if (raw.reporters !== undefined) {
    if (!Array.isArray(raw.reporters) || raw.reporters.length === 0) {
      errors.push('reporters must be a non-empty array');
    } else {
      const reportFiles = new Set();
      raw.reporters.forEach((reporter, index) => {
        if (!reporter || typeof reporter !== 'object' || Array.isArray(reporter)) {
          errors.push(`reporters[${index}] must be an object`);
          return;
        }
        rejectUnknownKeys(reporter, ['type', 'file', 'options'], `reporters[${index}]`, errors);
        if (!KNOWN_REPORTER_TYPES.includes(reporter.type)) {
          errors.push(`reporters[${index}].type must be one of: ${KNOWN_REPORTER_TYPES.join(', ')}`);
          return;
        }
        if (reporter.options !== undefined) {
          if (!reporter.options || typeof reporter.options !== 'object' || Array.isArray(reporter.options)) {
            errors.push(`reporters[${index}].options must be an object`);
          } else {
            const optionsProblem = validateJsonSafe(reporter.options, `reporters[${index}].options`);
            if (optionsProblem) errors.push(optionsProblem);
          }
        }
        if (reporter.type === 'console') {
          if (reporter.file !== undefined) errors.push(`reporters[${index}].file is not valid for console`);
          return;
        }
        const fileProblem = validateRelativeOutputFile(reporter.file);
        if (fileProblem) {
          errors.push(`reporters[${index}].file ${fileProblem}`);
          return;
        }
        const canonical = path.normalize(reporter.file);
        if (reportFiles.has(canonical)) errors.push(`reporter file must be unique: ${reporter.file}`);
        reportFiles.add(canonical);
      });
    }
  }

  if (raw.gate !== undefined) validateGate(raw.gate, errors);
  if (raw.suppressions !== undefined) {
    if (!Array.isArray(raw.suppressions)) {
      errors.push('suppressions must be an array');
    } else {
      raw.suppressions.forEach((suppression, index) => {
        const problem = validateSuppression(suppression);
        if (problem) errors.push(`suppressions[${index}]: ${problem}`);
      });
    }
  }
  return errors;
}


function validateAdapterConfig(adapter, index, errors) {
  const prefix = `adapters[${index}]`;
  const common = ['type', 'id', 'required'];
  switch (adapter.type) {
    case 'manual-evidence':
      rejectUnknownKeys(adapter, [...common, 'file', 'allowProjectMismatch'], prefix, errors);
      requireNonEmptyString(adapter.file, `${prefix}.file`, errors);
      if (adapter.allowProjectMismatch !== undefined && typeof adapter.allowProjectMismatch !== 'boolean') {
        errors.push(`${prefix}.allowProjectMismatch must be boolean`);
      }
      break;
    case 'native-evidence': {
      rejectUnknownKeys(adapter, [...common, 'file', 'files'], prefix, errors);
      const hasFile = typeof adapter.file === 'string' && adapter.file.trim() !== '';
      const hasFiles = Array.isArray(adapter.files) && adapter.files.length > 0
        && adapter.files.every((file) => typeof file === 'string' && file.trim() !== '');
      if (!hasFile && !hasFiles) errors.push(`${prefix} requires file or non-empty files`);
      if (hasFile && hasFiles) errors.push(`${prefix} must use file or files, not both`);
      break;
    }
    case 'command-evidence':
      rejectUnknownKeys(adapter, [...common, 'command', 'args', 'cwd', 'env', 'timeoutMs', 'maxOutputBytes', 'outputFile', 'captureStderr'], prefix, errors);
      requireNonEmptyString(adapter.command, `${prefix}.command`, errors);
      if (adapter.args !== undefined && (!Array.isArray(adapter.args) || adapter.args.some((arg) => typeof arg !== 'string'))) {
        errors.push(`${prefix}.args must be an array of strings`);
      }
      if (adapter.cwd !== undefined) requireNonEmptyString(adapter.cwd, `${prefix}.cwd`, errors);
      if (adapter.env !== undefined && (!adapter.env || typeof adapter.env !== 'object' || Array.isArray(adapter.env)
        || Object.values(adapter.env).some((value) => typeof value !== 'string'))) {
        errors.push(`${prefix}.env must be an object containing only string values`);
      }
      validatePositiveInteger(adapter.timeoutMs, `${prefix}.timeoutMs`, errors);
      validatePositiveInteger(adapter.maxOutputBytes, `${prefix}.maxOutputBytes`, errors);
      if (adapter.captureStderr !== undefined && typeof adapter.captureStderr !== 'boolean') {
        errors.push(`${prefix}.captureStderr must be boolean`);
      }
      if (adapter.outputFile !== undefined) requireNonEmptyString(adapter.outputFile, `${prefix}.outputFile`, errors);
      break;
    case 'module':
      rejectUnknownKeys(adapter, [...common, 'module', 'options'], prefix, errors);
      requireNonEmptyString(adapter.module, `${prefix}.module`, errors);
      validateJsonObject(adapter.options, `${prefix}.options`, errors);
      break;
    case 'svelte':
      rejectUnknownKeys(adapter, [...common, 'include', 'ignoreNames', 'maxFiles', 'allowEmpty', 'compilerOptions'], prefix, errors);
      validateStringArray(adapter.include, `${prefix}.include`, errors, { nonEmpty: true });
      validateStringArray(adapter.ignoreNames, `${prefix}.ignoreNames`, errors);
      validatePositiveInteger(adapter.maxFiles, `${prefix}.maxFiles`, errors);
      if (adapter.allowEmpty !== undefined && typeof adapter.allowEmpty !== 'boolean') {
        errors.push(`${prefix}.allowEmpty must be boolean`);
      }
      validatePlainObject(adapter.compilerOptions, `${prefix}.compilerOptions`, errors);
      break;
    case 'playwright-axe': {
      rejectUnknownKeys(adapter, [...common, 'baseURL', 'browser', 'scenarios', 'timeoutMs', 'launchOptions', 'contextOptions', 'runOnly', 'include', 'exclude', 'axeOptions', 'probes', 'screenshotOnFinding', 'webServer'], prefix, errors);
      if (adapter.baseURL !== undefined) requireNonEmptyString(adapter.baseURL, `${prefix}.baseURL`, errors);
      if (adapter.browser !== undefined && !['chromium', 'firefox', 'webkit'].includes(adapter.browser)) {
        errors.push(`${prefix}.browser must be chromium, firefox, or webkit`);
      }
      validateStringArray(adapter.runOnly, `${prefix}.runOnly`, errors);
      validateStringArray(adapter.include, `${prefix}.include`, errors);
      validateStringArray(adapter.exclude, `${prefix}.exclude`, errors);
      validatePositiveInteger(adapter.timeoutMs, `${prefix}.timeoutMs`, errors);
      validatePlainObject(adapter.launchOptions, `${prefix}.launchOptions`, errors);
      validatePlainObject(adapter.contextOptions, `${prefix}.contextOptions`, errors);
      validatePlainObject(adapter.axeOptions, `${prefix}.axeOptions`, errors);
      validateRuntimeProbes(adapter.probes, `${prefix}.probes`, errors);
      if (adapter.screenshotOnFinding !== undefined && typeof adapter.screenshotOnFinding !== 'boolean') {
        errors.push(`${prefix}.screenshotOnFinding must be boolean`);
      }
      if (adapter.webServer !== undefined) validateWebServerConfig(adapter.webServer, `${prefix}.webServer`, errors);
      if (!Array.isArray(adapter.scenarios) || adapter.scenarios.length === 0) {
        errors.push(`${prefix}.scenarios must be a non-empty array`);
        break;
      }
      adapter.scenarios.forEach((scenario, scenarioIndex) => validateScenario(scenario, `${prefix}.scenarios[${scenarioIndex}]`, errors));
      const everyScenarioHasUrl = adapter.scenarios.every((scenario) => scenario && typeof scenario.url === 'string' && scenario.url.trim() !== '');
      if (!everyScenarioHasUrl) requireNonEmptyString(adapter.baseURL, `${prefix}.baseURL`, errors);
      break;
    }
    default:
      break;
  }
}

function validateScenario(scenario, prefix, errors) {
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  rejectUnknownKeys(scenario, ['name', 'path', 'url', 'waitUntil', 'timeoutMs', 'setup', 'teardown', 'steps', 'runOnly', 'include', 'exclude', 'axeOptions', 'probes', 'screenshotOnFinding'], prefix, errors);
  requireNonEmptyString(scenario.name, `${prefix}.name`, errors);
  const hasUrl = typeof scenario.url === 'string' && scenario.url.trim() !== '';
  const hasPath = typeof scenario.path === 'string' && scenario.path.trim() !== '';
  if (!hasUrl && !hasPath) errors.push(`${prefix} requires path or url`);
  if (hasUrl && hasPath) errors.push(`${prefix} must use path or url, not both`);
  if (scenario.waitUntil !== undefined && !['commit', 'domcontentloaded', 'load', 'networkidle'].includes(scenario.waitUntil)) {
    errors.push(`${prefix}.waitUntil must be commit, domcontentloaded, load, or networkidle`);
  }
  validatePositiveInteger(scenario.timeoutMs, `${prefix}.timeoutMs`, errors);
  for (const field of ['setup', 'teardown']) {
    if (scenario[field] !== undefined && typeof scenario[field] !== 'function') errors.push(`${prefix}.${field} must be a function`);
  }
  validateStringArray(scenario.runOnly, `${prefix}.runOnly`, errors);
  validateStringArray(scenario.include, `${prefix}.include`, errors);
  validateStringArray(scenario.exclude, `${prefix}.exclude`, errors);
  validatePlainObject(scenario.axeOptions, `${prefix}.axeOptions`, errors);
  validateRuntimeProbes(scenario.probes, `${prefix}.probes`, errors);
  if (scenario.screenshotOnFinding !== undefined && typeof scenario.screenshotOnFinding !== 'boolean') {
    errors.push(`${prefix}.screenshotOnFinding must be boolean`);
  }
  if (scenario.steps !== undefined) {
    if (!Array.isArray(scenario.steps)) errors.push(`${prefix}.steps must be an array`);
    else scenario.steps.forEach((step, index) => validateStep(step, `${prefix}.steps[${index}]`, errors));
  }
}

function validateStep(step, prefix, errors) {
  if (typeof step === 'function') return;
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    errors.push(`${prefix} must be a function or object`);
    return;
  }
  const actions = ['click', 'fill', 'press', 'check', 'uncheck', 'selectOption', 'waitFor', 'expectVisible', 'waitForURL', 'waitForTimeout', 'setViewport'];
  if (!actions.includes(step.action)) {
    errors.push(`${prefix}.action must be one of: ${actions.join(', ')}`);
    return;
  }
  const allowedByAction = {
    click: ['action', 'selector', 'options'],
    fill: ['action', 'selector', 'value', 'options'],
    press: ['action', 'selector', 'key', 'options'],
    check: ['action', 'selector', 'options'],
    uncheck: ['action', 'selector', 'options'],
    selectOption: ['action', 'selector', 'value', 'options'],
    waitFor: ['action', 'selector', 'state', 'options'],
    expectVisible: ['action', 'selector', 'options'],
    waitForURL: ['action', 'url', 'options'],
    waitForTimeout: ['action', 'milliseconds'],
    setViewport: ['action', 'width', 'height']
  };
  rejectUnknownKeys(step, allowedByAction[step.action], prefix, errors);
  if (['click', 'fill', 'press', 'check', 'uncheck', 'selectOption', 'waitFor', 'expectVisible'].includes(step.action)) {
    requireNonEmptyString(step.selector, `${prefix}.selector`, errors);
  }
  if (step.action === 'press') requireNonEmptyString(step.key, `${prefix}.key`, errors);
  if (step.action === 'waitForURL' && !(typeof step.url === 'string' || step.url instanceof RegExp)) {
    errors.push(`${prefix}.url must be a string or RegExp`);
  }
  if (step.action === 'waitForTimeout') validatePositiveInteger(step.milliseconds, `${prefix}.milliseconds`, errors);
  if (step.action === 'setViewport') {
    validatePositiveInteger(step.width, `${prefix}.width`, errors);
    validatePositiveInteger(step.height, `${prefix}.height`, errors);
  }
  validatePlainObject(step.options, `${prefix}.options`, errors);
}

function validateRuntimeProbes(probes, prefix, errors) {
  if (probes === undefined) return;
  if (!probes || typeof probes !== 'object' || Array.isArray(probes)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  rejectUnknownKeys(probes, ['targetSizeEnhanced', 'focusIndicatorReview'], prefix, errors);
  if (probes.targetSizeEnhanced !== undefined) {
    const probe = probes.targetSizeEnhanced;
    if (!probe || typeof probe !== 'object' || Array.isArray(probe)) errors.push(`${prefix}.targetSizeEnhanced must be an object`);
    else {
      rejectUnknownKeys(probe, ['enabled', 'minimum', 'selector', 'ignoreSelector', 'severity'], `${prefix}.targetSizeEnhanced`, errors);
      if (typeof probe.enabled !== 'boolean') errors.push(`${prefix}.targetSizeEnhanced.enabled must be boolean`);
      validatePositiveInteger(probe.minimum, `${prefix}.targetSizeEnhanced.minimum`, errors);
      if (probe.selector !== undefined) requireNonEmptyString(probe.selector, `${prefix}.targetSizeEnhanced.selector`, errors);
      if (probe.ignoreSelector !== undefined) requireNonEmptyString(probe.ignoreSelector, `${prefix}.targetSizeEnhanced.ignoreSelector`, errors);
      if (probe.severity !== undefined && !SEVERITIES.includes(probe.severity)) errors.push(`${prefix}.targetSizeEnhanced.severity is invalid`);
    }
  }
  if (probes.focusIndicatorReview !== undefined) {
    const probe = probes.focusIndicatorReview;
    if (!probe || typeof probe !== 'object' || Array.isArray(probe)) errors.push(`${prefix}.focusIndicatorReview must be an object`);
    else {
      rejectUnknownKeys(probe, ['enabled', 'maxTabs', 'severity'], `${prefix}.focusIndicatorReview`, errors);
      if (typeof probe.enabled !== 'boolean') errors.push(`${prefix}.focusIndicatorReview.enabled must be boolean`);
      validatePositiveInteger(probe.maxTabs, `${prefix}.focusIndicatorReview.maxTabs`, errors);
      if (probe.severity !== undefined && !SEVERITIES.includes(probe.severity)) errors.push(`${prefix}.focusIndicatorReview.severity is invalid`);
    }
  }
}

function validateWebServerConfig(server, prefix, errors) {
  if (!server || typeof server !== 'object' || Array.isArray(server)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  requireNonEmptyString(server.command, `${prefix}.command`, errors);
  if (server.args !== undefined && (!Array.isArray(server.args) || server.args.some((arg) => typeof arg !== 'string'))) {
    errors.push(`${prefix}.args must be an array of strings`);
  }
  if (server.env !== undefined && (!server.env || typeof server.env !== 'object' || Array.isArray(server.env)
    || Object.values(server.env).some((value) => typeof value !== 'string'))) {
    errors.push(`${prefix}.env must contain only string values`);
  }
  for (const field of ['timeoutMs', 'pollIntervalMs', 'requestTimeoutMs', 'shutdownTimeoutMs', 'maxOutputBytes']) {
    validatePositiveInteger(server[field], `${prefix}.${field}`, errors);
  }
  if (server.reuseExistingServer !== undefined && typeof server.reuseExistingServer !== 'boolean') {
    errors.push(`${prefix}.reuseExistingServer must be boolean`);
  }
  if (server.cwd !== undefined) requireNonEmptyString(server.cwd, `${prefix}.cwd`, errors);
  if (server.url !== undefined) requireNonEmptyString(server.url, `${prefix}.url`, errors);
}

function rejectUnknownKeys(value, allowed, prefix, errors) {
  const known = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!known.has(key)) errors.push(`${prefix}.${key} is not supported`);
  }
}

function validateStringArray(value, field, errors, options = {}) {
  if (value === undefined) return;
  if (!Array.isArray(value) || (options.nonEmpty && value.length === 0)
    || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    errors.push(`${field} must be ${options.nonEmpty ? 'a non-empty' : 'an'} array of non-empty strings`);
  }
}

function validatePlainObject(value, field, errors) {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
    errors.push(`${field} must be an object`);
  }
}

function validateJsonObject(value, field, errors) {
  if (value === undefined) return;
  validatePlainObject(value, field, errors);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const problem = validateJsonSafe(value, field);
    if (problem) errors.push(problem);
  }
}

function requireNonEmptyString(value, field, errors) {
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${field} must be a non-empty string`);
}

function validatePositiveInteger(value, field, errors) {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    errors.push(`${field} must be a positive integer`);
  }
}

function validateGate(gate, errors) {
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    errors.push('gate must be an object');
    return;
  }
  rejectUnknownKeys(gate, ['failOnSeverities', 'failOnOutcomes', 'unresolvedOutcomes', 'unresolvedEvidence', 'executionErrors', 'requireApplicableSurface'], 'gate', errors);
  validateEnumArray(gate.failOnSeverities, SEVERITIES, 'gate.failOnSeverities', errors);
  validateEnumArray(gate.failOnOutcomes, OUTCOMES, 'gate.failOnOutcomes', errors);
  validateEnumArray(gate.unresolvedOutcomes, OUTCOMES, 'gate.unresolvedOutcomes', errors);
  for (const field of ['unresolvedEvidence', 'executionErrors']) {
    if (gate[field] !== undefined && !['error', 'ignore'].includes(gate[field])) {
      errors.push(`gate.${field} must be error or ignore`);
    }
  }
  if (gate.requireApplicableSurface !== undefined && typeof gate.requireApplicableSurface !== 'boolean') {
    errors.push('gate.requireApplicableSurface must be boolean');
  }
}

function validateEnumArray(value, allowed, field, errors) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((entry) => !allowed.includes(entry))) {
    errors.push(`${field} must contain only: ${allowed.join(', ')}`);
  }
}

export async function writeStarterFiles(targetDirectory, options = {}) {
  const directory = path.resolve(targetDirectory);
  const configPath = path.join(directory, 'wcag-auditor.config.mjs');
  const evidenceDirectory = path.join(directory, 'wcag-audit');
  const evidencePath = path.join(evidenceDirectory, 'manual-evidence.json');

  if (!options.force && ((await pathExists(configPath)) || (await pathExists(evidencePath)))) {
    throw new ConfigError('Starter files already exist. Use --force to overwrite them.');
  }
  await fs.mkdir(evidenceDirectory, { recursive: true });
  await fs.writeFile(configPath, starterConfig(), 'utf8');
  await fs.writeFile(evidencePath, `${JSON.stringify(starterEvidence(), null, 2)}\n`, 'utf8');
  return { configPath, evidencePath };
}

function starterConfig() {
  return `export default {
  schemaVersion: 1,
  project: {
    name: 'replace-with-project-name',
    root: '.'
  },
  profile: 'wcag22-aa',
  adapters: [
    {
      type: 'svelte',
      include: ['src/**/*.svelte'],
      required: false
    },
    {
      type: 'playwright-axe',
      baseURL: 'http://127.0.0.1:4173',
      browser: 'chromium',
      scenarios: [
        { name: 'home', path: '/', steps: [] }
      ],
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
      probes: {
        targetSizeEnhanced: { enabled: true, minimum: 44 },
        focusIndicatorReview: { enabled: true, maxTabs: 80 }
      }
    },
    {
      type: 'manual-evidence',
      file: 'wcag-audit/manual-evidence.json',
      required: true
    }
  ],
  gate: {
    failOnSeverities: ['critical', 'serious', 'moderate', 'minor'],
    failOnOutcomes: ['failed'],
    unresolvedOutcomes: ['cantTell', 'untested'],
    unresolvedEvidence: 'error',
    executionErrors: 'error',
    requireApplicableSurface: true
  },
  reporters: [
    { type: 'console' },
    { type: 'json', file: 'wcag-audit.json' },
    { type: 'sarif', file: 'wcag-audit.sarif' },
    { type: 'junit', file: 'wcag-audit.junit.xml' },
    { type: 'html', file: 'wcag-audit.html' }
  ],
  suppressions: []
};
`;
}

function starterEvidence() {
  return {
    schemaVersion: 1,
    project: 'replace-with-project-name',
    updatedAt: new Date().toISOString(),
    checks: [
      {
        id: 'keyboard-complete-workflows',
        title: 'Keyboard-only complete workflows',
        outcome: 'untested',
        severity: 'serious',
        tester: 'replace-with-tester',
        testedAt: null,
        expiresAt: null,
        environment: 'Supported OS and browser or WebView, keyboard only',
        standards: [
          { document: 'WCAG-2.2', requirement: '2.1.1', level: 'A', mapping: 'conformance' },
          { document: 'WCAG-2.2', requirement: '2.1.2', level: 'A', mapping: 'conformance' }
        ],
        evidence: '',
        notes: '',
        remediation: 'Complete every essential workflow using only the keyboard and record defects.'
      },
      {
        id: 'screen-reader-smoke',
        title: 'Screen-reader smoke test',
        outcome: 'untested',
        severity: 'serious',
        tester: 'replace-with-tester',
        testedAt: null,
        expiresAt: null,
        environment: 'Supported OS, browser or WebView, and screen reader',
        standards: [
          { document: 'WCAG-2.2', requirement: '4.1.2', level: 'A', mapping: 'conformance' }
        ],
        evidence: '',
        notes: '',
        remediation: 'Verify names, roles, states, values, reading order, announcements, and focus behavior.'
      }
    ]
  };
}
