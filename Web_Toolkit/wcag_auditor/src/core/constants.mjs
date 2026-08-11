export const TOOLKIT_NAME = 'WCAG Auditor';
export const PACKAGE_NAME = 'portable-wcag-auditor';
export const TOOLKIT_VERSION = '2.0.3';
export const CONFIG_SCHEMA_VERSION = 1;
export const RUN_SCHEMA_VERSION = '1.0.0';
export const EVIDENCE_SCHEMA_VERSION = 1;
export const NATIVE_EVIDENCE_SCHEMA_VERSION = 1;

export const OUTCOMES = Object.freeze([
  'passed',
  'failed',
  'inapplicable',
  'cantTell',
  'untested',
  'executionError'
]);

export const SEVERITIES = Object.freeze([
  'critical',
  'serious',
  'moderate',
  'minor',
  'advisory'
]);

export const CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low']);
export const AUTOMATION_LEVELS = Object.freeze(['automatic', 'semi-automatic', 'manual']);
export const ADAPTER_STATUSES = Object.freeze(['completed', 'skipped', 'failed']);

export const EXIT_CODES = Object.freeze({
  PASS: 0,
  BLOCKING_FINDINGS: 1,
  EXECUTION_ERROR: 2,
  UNRESOLVED_EVIDENCE: 3
});

export const DEFAULT_IGNORES = Object.freeze([
  '.git',
  '.hg',
  '.svn',
  '.idea',
  '.vscode',
  '.svelte-kit',
  '.astro',
  '.next',
  '.nuxt',
  'node_modules',
  'target',
  'dist',
  'build',
  'coverage',
  'vendor'
]);

export const DEFAULT_GATE = Object.freeze({
  failOnSeverities: ['critical', 'serious', 'moderate', 'minor'],
  failOnOutcomes: ['failed'],
  unresolvedOutcomes: ['cantTell', 'untested'],
  unresolvedEvidence: 'error',
  executionErrors: 'error',
  requireApplicableSurface: true
});

export const KNOWN_ADAPTER_TYPES = Object.freeze([
  'manual-evidence',
  'module',
  'native-evidence',
  'command-evidence',
  'svelte',
  'playwright-axe'
]);

export const KNOWN_REPORTER_TYPES = Object.freeze([
  'console',
  'json',
  'sarif',
  'junit',
  'html',
  'markdown',
  'dashboard'
]);
