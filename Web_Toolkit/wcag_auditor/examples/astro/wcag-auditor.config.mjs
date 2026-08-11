// Astro / Portable Web Toolkit example configuration.
// Copy to the client project root as wcag-auditor.config.mjs and edit routes.
export default {
  schemaVersion: 1,
  project: {
    name: 'example-astro-site',
    root: '.'
  },
  profile: 'wcag22-aa',
  outputDirectory: '.wcag-audit-results',
  adapters: [
    {
      type: 'playwright-axe',
      baseURL: 'http://127.0.0.1:4321',
      browser: 'chromium',
      scenarios: [
        { name: 'home', path: '/', steps: [] }
      ],
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
      probes: {
        targetSizeEnhanced: { enabled: true, minimum: 44 },
        focusIndicatorReview: { enabled: true, maxTabs: 80 }
      },
      webServer: {
        command: 'npm',
        args: ['run', 'preview'],
        url: 'http://127.0.0.1:4321',
        timeoutMs: 120000,
        reuseExistingServer: true
      }
    },
    {
      type: 'manual-evidence',
      file: 'wcag-audit/manual-evidence.json',
      required: false
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
    { type: 'html', file: 'wcag-audit.html' },
    { type: 'dashboard', file: 'wcag-audit-dashboard.html' },
    { type: 'markdown', file: 'wcag-audit.md' }
  ],
  // After frost-glass-contrast manual AA pass, add cantTell suppressions for axe/color-contrast.
  // See docs/GLASSMORPHISM.md and examples/astro/frost-canttell-suppression.example.mjs
  suppressions: [],
  metadata: {
    portableToolkit: true,
    stack: 'astro'
  }
};
