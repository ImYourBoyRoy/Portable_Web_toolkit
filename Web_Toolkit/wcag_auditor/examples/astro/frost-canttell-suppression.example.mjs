// ./Web_Toolkit/wcag_auditor/examples/astro/frost-canttell-suppression.example.mjs
/**
 * Example bounded suppression for axe color-contrast incompletes on frost/glass UI.
 *
 * After you mark frost-glass-contrast passed in wcag-audit/manual-evidence.json,
 * copy an entry like this into wcag-auditor.config.mjs → suppressions[].
 *
 * Do not use unresolvedEvidence: 'ignore' to hide glass findings.
 */

export const frostColorContrastCantTellSuppression = {
  ruleId: 'axe/color-contrast',
  outcomes: ['cantTell'],
  adapter: 'playwright-axe',
  routeOrScene: 'home',
  justification:
    'Manual AA contrast verified on frosted/glass panels (wcag-audit/manual-evidence.json → frost-glass-contrast). axe cannot compute contrast through backdrop-filter / translucent layers; visual language retained.',
  owner: 'a11y-owner@example.test',
  ticket: 'A11Y-FROST-1',
  createdAt: '2026-08-11T00:00:00.000Z',
  expiresAt: '2026-11-11T00:00:00.000Z'
};
