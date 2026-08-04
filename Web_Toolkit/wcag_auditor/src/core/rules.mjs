export const BUILTIN_RULES = Object.freeze([
  {
    id: 'wcag-auditor/system/adapter-execution',
    version: '1.0.0',
    title: 'Accessibility adapter execution failed',
    type: 'system',
    inputAspect: 'execution',
    applicability: 'Configured accessibility adapters.',
    expectation: 'Every required adapter completes successfully and returns valid evidence.',
    automation: 'automatic',
    standards: [{ document: 'INTERNAL', requirement: 'adapter-execution', mapping: 'policy' }],
    assumptions: [],
    limitations: [],
    references: []
  },
  {
    id: 'wcag-auditor/system/no-applicable-surface',
    version: '1.0.0',
    title: 'No applicable accessibility surface was tested',
    type: 'system',
    inputAspect: 'execution',
    applicability: 'Accessibility runs configured as release gates.',
    expectation: 'At least one adapter evaluates an applicable file, route, scene, state, or manual check.',
    automation: 'automatic',
    standards: [{ document: 'INTERNAL', requirement: 'applicable-test-surface', mapping: 'policy' }],
    assumptions: [],
    limitations: [],
    references: []
  },
  {
    id: 'wcag-auditor/runtime/target-size-enhanced',
    version: '1.0.0',
    title: 'Rendered target meets enhanced size policy',
    type: 'policy',
    inputAspect: 'geometry',
    applicability: 'Visible and enabled interactive targets selected by the runtime probe.',
    expectation: 'Rendered target width and height are at least the configured minimum, 44 CSS px by default.',
    automation: 'automatic',
    standards: [
      { document: 'WCAG-2.2', requirement: '2.5.5', level: 'AAA', mapping: 'secondary' },
      { document: 'INTERNAL', requirement: 'rendered-target-size-enhanced', mapping: 'policy' }
    ],
    assumptions: ['Browser geometry represents the configured viewport and zoom.'],
    limitations: ['WCAG exceptions, overlapping targets, and equivalent controls can require human review.'],
    references: ['https://www.w3.org/TR/WCAG22/#target-size-enhanced']
  },
  {
    id: 'wcag-auditor/runtime/focus-indicator-review',
    version: '1.0.0',
    title: 'Keyboard focus indicator requires review',
    type: 'policy',
    inputAspect: 'interaction',
    applicability: 'Elements reached during keyboard Tab navigation.',
    expectation: 'Keyboard focus remains visible and produces a detectable visual change.',
    automation: 'semi-automatic',
    standards: [
      { document: 'WCAG-2.2', requirement: '2.4.7', level: 'AA', mapping: 'secondary' },
      { document: 'WCAG-2.2', requirement: '2.4.13', level: 'AAA', mapping: 'secondary' },
      { document: 'INTERNAL', requirement: 'focus-indicator-review', mapping: 'policy' }
    ],
    assumptions: ['Computed style and geometry differences are useful signals.'],
    limitations: ['This probe does not prove the WCAG focus-area or contrast calculations.'],
    references: [
      'https://www.w3.org/TR/WCAG22/#focus-visible',
      'https://www.w3.org/TR/WCAG22/#focus-appearance'
    ]
  },
  {
    id: 'wcag-auditor/evidence/expired',
    version: '1.0.0',
    title: 'Manual accessibility evidence expired',
    type: 'governance',
    inputAspect: 'manual',
    applicability: 'Manual evidence with an expiration date.',
    expectation: 'Required manual evidence remains current through its declared expiration date.',
    automation: 'automatic',
    standards: [{ document: 'INTERNAL', requirement: 'manual-evidence-freshness', mapping: 'policy' }],
    assumptions: [],
    limitations: [],
    references: []
  },
  {
    id: 'wcag-auditor/governance/suppression-expired',
    version: '1.0.0',
    title: 'Accessibility suppression expired',
    type: 'governance',
    inputAspect: 'manual',
    applicability: 'Configured suppressions.',
    expectation: 'Every suppression is justified, owned, ticketed, and unexpired.',
    automation: 'automatic',
    standards: [{ document: 'INTERNAL', requirement: 'suppression-governance', mapping: 'policy' }],
    assumptions: [],
    limitations: [],
    references: []
  },
  {
    id: 'wcag-auditor/governance/suppression-invalid',
    version: '1.0.0',
    title: 'Accessibility suppression is invalid',
    type: 'governance',
    inputAspect: 'manual',
    applicability: 'Configured suppressions.',
    expectation: 'Every suppression includes a bounded scope, justification, owner, ticket, and valid dates.',
    automation: 'automatic',
    standards: [{ document: 'INTERNAL', requirement: 'suppression-governance', mapping: 'policy' }],
    assumptions: [],
    limitations: [],
    references: []
  }
]);

export function getBuiltinRules() {
  return structuredClone(BUILTIN_RULES);
}

export function findBuiltinRule(ruleId) {
  const rule = BUILTIN_RULES.find((candidate) => candidate.id === ruleId);
  return rule ? structuredClone(rule) : null;
}
