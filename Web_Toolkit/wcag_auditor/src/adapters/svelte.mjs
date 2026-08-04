import { promises as fs } from 'node:fs';
import path from 'node:path';
import { AdapterError } from '../core/errors.mjs';
import { listFiles, normalizePath } from '../core/filesystem.mjs';
import { importOptional } from '../core/dependencies.mjs';

export async function runSvelteAdapter(config, context) {
  const compilerModule = context.modules?.svelteCompiler
    ?? await importOptional('svelte/compiler', 'the Svelte compiler adapter', context.importModule);
  const compile = compilerModule.compile ?? compilerModule.default?.compile;
  if (typeof compile !== 'function') throw new AdapterError('svelte/compiler did not expose compile()');

  const files = await listFiles(context.projectRoot, {
    include: config.include ?? ['src/**/*.svelte'],
    ignoreNames: config.ignoreNames,
    maxFiles: config.maxFiles ?? 20_000
  });
  if (files.length === 0 && config.allowEmpty !== true) {
    throw new AdapterError('Svelte adapter found no matching files', { include: config.include ?? ['src/**/*.svelte'] });
  }

  const findings = [];
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const relative = normalizePath(path.relative(context.projectRoot, file));
    try {
      const result = compile(source, {
        ...config.compilerOptions,
        filename: file,
        generate: false
      });
      for (const warning of result.warnings ?? []) {
        if (!String(warning.code ?? '').startsWith('a11y_')) continue;
        findings.push(mapSvelteWarning(warning, relative, context.adapterName));
      }
    } catch (error) {
      findings.push({
        ruleId: 'wcag-auditor/system/adapter-execution',
        title: 'Svelte compiler could not analyze component',
        description: error.message,
        outcome: 'executionError',
        severity: 'serious',
        confidence: 'high',
        automation: 'automatic',
        target: {
          adapter: context.adapterName,
          file: relative,
          line: error.start?.line,
          column: error.start?.column === undefined ? undefined : error.start.column + 1
        },
        standards: [{ document: 'INTERNAL', requirement: 'adapter-execution', mapping: 'policy' }],
        evidence: { code: error.code, message: error.message },
        remediation: 'Fix the Svelte compiler error so accessibility diagnostics can run.',
        tags: ['svelte', 'compiler-error']
      });
    }
  }
  return { findings, surfaceCount: files.length, metadata: { filesScanned: files.length } };
}

function mapSvelteWarning(warning, file, adapterName) {
  const code = String(warning.code);
  return {
    ruleId: `svelte/${code}`,
    ruleVersion: 'compiler',
    title: humanizeCode(code),
    description: warning.message ?? '',
    outcome: 'failed',
    severity: severityFor(code),
    confidence: 'high',
    automation: 'automatic',
    target: {
      adapter: adapterName,
      file,
      line: warning.start?.line,
      column: warning.start?.column === undefined ? undefined : warning.start.column + 1
    },
    standards: [],
    evidence: { code, message: warning.message, frame: warning.frame },
    remediation: 'Resolve the Svelte accessibility compiler warning or document a narrowly scoped suppression.',
    helpUrl: `https://svelte.dev/e/${encodeURIComponent(code)}`,
    tags: ['svelte', 'compiler-warning', 'accessibility']
  };
}

function severityFor(code) {
  const serious = new Set([
    'a11y_click_events_have_key_events',
    'a11y_interactive_supports_focus',
    'a11y_misplaced_role',
    'a11y_no_abstract_role',
    'a11y_no_noninteractive_element_interactions',
    'a11y_no_noninteractive_tabindex',
    'a11y_no_static_element_interactions',
    'a11y_unknown_role'
  ]);
  return serious.has(code) ? 'serious' : 'moderate';
}

function humanizeCode(code) {
  return code.replace(/^a11y_/, '').split('_').map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`).join(' ');
}
