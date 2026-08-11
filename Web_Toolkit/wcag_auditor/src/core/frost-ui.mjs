// ./Web_Toolkit/wcag_auditor/src/core/frost-ui.mjs
/**
 * Glassmorphism / frost UI helpers for the WCAG evidence gate.
 *
 * Axe often marks translucent / backdrop-filtered text as color-contrast
 * incomplete (cantTell). That is unresolved evidence — not an instruction to
 * strip frost UI. Prefer AA contrast design + manual evidence + bounded
 * cantTell suppressions.
 */

import { OUTCOMES } from './constants.mjs';

export const DEFAULT_SUPPRESSION_OUTCOMES = Object.freeze(['failed']);

/** Outcomes a suppression may cover (failed defects + unresolved axe incompletes). */
export const SUPPRESSABLE_OUTCOMES = Object.freeze(['failed', 'cantTell']);

/**
 * Starter manual-evidence check for frosted / glass panels (WCAG 1.4.3).
 * @param {object} [options]
 * @returns {object}
 */
export function frostGlassContrastCheck(options = {}) {
  const check = {
    id: options.id ?? 'frost-glass-contrast',
    title: options.title ?? 'Glassmorphism / frosted panel text contrast (WCAG 1.4.3)',
    outcome: 'untested',
    severity: 'serious',
    tester: options.tester ?? 'replace-with-tester',
    testedAt: null,
    expiresAt: null,
    environment:
      options.environment
      ?? 'Supported OS and browser; sample frosted panels over light and dark hero/media backgrounds',
    standards: [
      { document: 'WCAG-2.2', requirement: '1.4.3', level: 'AA', mapping: 'conformance' }
    ],
    evidence: '',
    notes:
      options.notes
      ?? 'Glass/frost (backdrop-filter, translucent rgba) often yields axe color-contrast cantTell. Keep the visual language; verify AA contrast for text and essential icons on each frost surface. Prefer stronger frost opacity, text-shadow, or solid underlays under text — not removing glass entirely.',
    remediation:
      options.remediation
      ?? 'Adjust frost opacity/tokens until AA passes a contrast sampler; record sampler method, routes, and screenshots in evidence; then add a bounded suppression with outcomes ["cantTell"] for axe/color-contrast on affected routes.',
    tags: ['glassmorphism', 'frost-ui', 'color-contrast', ...(options.tags ?? [])]
  };
  if (options.routeOrScene) check.routeOrScene = options.routeOrScene;
  if (options.state) check.state = options.state;
  return check;
}

/**
 * Example bounded suppression for axe incomplete contrast on frost UI.
 * Copy into wcag-auditor.config.mjs suppressions after manual AA verification.
 */
export function frostContrastCantTellSuppressionExample(overrides = {}) {
  return {
    ruleId: 'axe/color-contrast',
    outcomes: ['cantTell'],
    adapter: 'playwright-axe',
    routeOrScene: overrides.routeOrScene ?? 'home',
    justification:
      overrides.justification
      ?? 'Manual AA contrast verified on frosted/glass panels (see wcag-audit/manual-evidence.json frost-glass-contrast). Translucent backdrop-filter surfaces make axe contrast incomplete; visual language retained.',
    owner: overrides.owner ?? 'replace-with-owner',
    ticket: overrides.ticket ?? 'A11Y-FROST-1',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    expiresAt: overrides.expiresAt ?? 'replace-with-iso-expiry'
  };
}

/**
 * Whether HTML / failure text looks like translucent / frost styling.
 * @param {string} html
 * @param {string} [failureSummary]
 */
export function looksLikeFrostOrTranslucent(html = '', failureSummary = '') {
  const blob = `${html}\n${failureSummary}`;
  return /backdrop-filter|(-webkit-)?backdrop-filter|glassmorphism|\bfrost\b|blur\s*\(|rgba?\([^)]*,\s*0?\.\d+|hsla?\([^)]*,\s*0?\.\d+|transparent|semi-?transparent/i.test(blob);
}

/**
 * Remediation text for axe findings, with frost/glass guidance on contrast cantTell.
 * @param {{ id?: string, help?: string }} rule
 * @param {{ html?: string, failureSummary?: string }} node
 * @param {string} outcome
 */
export function axeRemediationWithFrostHint(rule, node, outcome) {
  const base = typeof rule.help === 'string' ? rule.help : '';
  if (outcome !== 'cantTell' || rule.id !== 'color-contrast') return base;

  const frost = looksLikeFrostOrTranslucent(node.html ?? '', node.failureSummary ?? '');
  const hint = frost
    ? ' Frosted/glass UI likely in the snippet: keep the aesthetic. Raise frost opacity or add a solid underlay under text, verify WCAG AA with a contrast sampler, record frost-glass-contrast manual evidence, then add a bounded suppression with outcomes: ["cantTell"] for axe/color-contrast. Do not strip glassmorphism solely to silence the gate.'
    : ' Translucent, gradient, or image backgrounds often make axe contrast incomplete (cantTell) — not an auto-fail. Design for WCAG AA, verify with a contrast sampler, document in wcag-audit/manual-evidence.json (frost-glass-contrast), then add a bounded suppression with outcomes: ["cantTell"] for axe/color-contrast on the affected route. Do not remove glass/frost UI solely to silence the gate.';
  return `${base}${hint}`.trim();
}

/**
 * Normalize suppression.outcomes (default failed-only for backward compatibility).
 * @param {unknown} value
 * @returns {string[] | null} null when invalid
 */
export function normalizeSuppressionOutcomes(value) {
  if (value === undefined) return [...DEFAULT_SUPPRESSION_OUTCOMES];
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.some((entry) => typeof entry !== 'string' || !OUTCOMES.includes(entry))) return null;
  if (value.some((entry) => !SUPPRESSABLE_OUTCOMES.includes(entry))) return null;
  return [...new Set(value)];
}
