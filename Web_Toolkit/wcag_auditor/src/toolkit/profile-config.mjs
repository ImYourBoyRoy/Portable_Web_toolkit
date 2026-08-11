// ./Web_Toolkit/wcag_auditor/src/toolkit/profile-config.mjs
/**
 * Build Astro/site-profile-aware WCAG auditor configs and starter files.
 *
 * Prefer a checked-in `wcag-auditor.config.mjs` in the client project.
 * Use `--from-profile` only for ephemeral profile-driven runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { frostGlassContrastCheck } from '../core/frost-ui.mjs';

function routesFromProfile(profile = {}) {
  const wcag = profile.diagnostics?.wcagAuditor || {};
  if (Array.isArray(wcag.routes) && wcag.routes.length > 0) return wcag.routes;
  if (Array.isArray(profile.diagnostics?.browserDiagnostics?.routes) && profile.diagnostics.browserDiagnostics.routes.length > 0) {
    return profile.diagnostics.browserDiagnostics.routes;
  }
  if (Array.isArray(profile.diagnostics?.qualitySmoke?.routes) && profile.diagnostics.qualitySmoke.routes.length > 0) {
    return profile.diagnostics.qualitySmoke.routes;
  }
  return ['/'];
}

function baseUrlFromProfile(profile = {}, flags = {}) {
  const wcag = profile.diagnostics?.wcagAuditor || {};
  if (flags['base-url']) return String(flags['base-url']).replace(/\/$/, '');
  if (wcag.baseURL) return String(wcag.baseURL).replace(/\/$/, '');
  if (wcag.baseUrl) return String(wcag.baseUrl).replace(/\/$/, '');
  const host = profile.hosts?.development?.[0] || profile.hosts?.production?.[0] || '';
  if (host) {
    if (/^https?:\/\//i.test(host)) return host.replace(/\/$/, '');
    return `https://${host}`.replace(/\/$/, '');
  }
  return 'http://127.0.0.1:4321';
}

function previewCommandFromProfile(profile = {}) {
  const wcag = profile.diagnostics?.wcagAuditor || {};
  if (Array.isArray(wcag.previewCommand) && wcag.previewCommand.length > 0) {
    return wcag.previewCommand.map(String);
  }
  const preview = String(profile.commands?.preview || '').trim();
  if (!preview) return null;
  // Prefer npm script form without shell wrapping when it matches common Astro scripts.
  if (preview === 'npm run preview' || preview === 'npm run preview --') {
    return ['npm', 'run', 'preview'];
  }
  return null;
}

function scenariosFromRoutes(routes = ['/']) {
  return routes.map((route, index) => {
    const pathname = String(route || '/');
    const name = pathname === '/' ? 'home' : pathname.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || `route-${index + 1}`;
    return { name, path: pathname, steps: [] };
  });
}

function hasSvelteSources(projectRoot) {
  const candidates = [
    path.join(projectRoot, 'src'),
    path.join(projectRoot, 'app')
  ];
  for (const root of candidates) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
          stack.push(full);
        } else if (entry.isFile() && entry.name.endsWith('.svelte')) {
          return true;
        }
      }
    }
  }
  return false;
}

export function buildAstroConfigObject({
  profile = {},
  projectRoot,
  outputDirectory,
  flags = {},
  includeManualEvidence = false
} = {}) {
  const siteId = profile.siteId || profile.branding?.seo?.siteName || path.basename(projectRoot);
  const routes = routesFromProfile(profile);
  const baseURL = baseUrlFromProfile(profile, flags);
  const previewCommand = previewCommandFromProfile(profile);
  const profileLevel = String(profile.diagnostics?.wcagAuditor?.profile || 'wcag22-aa');
  const adapters = [];

  if (hasSvelteSources(projectRoot) || flags['include-svelte'] === true || flags['include-svelte'] === 'true') {
    adapters.push({
      type: 'svelte',
      include: ['src/**/*.svelte'],
      required: false
    });
  }

  const playwrightAdapter = {
    type: 'playwright-axe',
    id: 'playwright-axe-primary',
    baseURL,
    browser: 'chromium',
    scenarios: scenariosFromRoutes(routes),
    runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
    probes: {
      targetSizeEnhanced: { enabled: true, minimum: 44 },
      focusIndicatorReview: { enabled: true, maxTabs: 80 }
    }
  };

  if (previewCommand && (flags['manage-server'] === true || flags['manage-server'] === 'true' || profile.diagnostics?.wcagAuditor?.manageServer)) {
    const [command, ...args] = previewCommand;
    playwrightAdapter.webServer = {
      command,
      args,
      url: baseURL,
      timeoutMs: Number(profile.diagnostics?.wcagAuditor?.serverTimeoutMs || 120000),
      reuseExistingServer: true
    };
  }

  adapters.push(playwrightAdapter);

  if (includeManualEvidence) {
    adapters.push({
      type: 'manual-evidence',
      file: 'wcag-audit/manual-evidence.json',
      required: false
    });
  }

  return {
    schemaVersion: 1,
    project: {
      name: String(siteId),
      // Absolute root so ephemeral configs living under output/ still locate client src/
      root: path.resolve(projectRoot || process.cwd())
    },
    profile: profileLevel,
    outputDirectory: outputDirectory || '.wcag-audit-results',
    adapters,
    gate: {
      failOnSeverities: ['critical', 'serious', 'moderate', 'minor'],
      failOnOutcomes: ['failed'],
      unresolvedOutcomes: ['cantTell', 'untested'],
      unresolvedEvidence: includeManualEvidence ? 'error' : 'ignore',
      executionErrors: 'error',
      requireApplicableSurface: true
    },
    reporters: [
      { type: 'console' },
      { type: 'json', file: 'wcag-audit.json' },
      { type: 'sarif', file: 'wcag-audit.sarif' },
      { type: 'junit', file: 'wcag-audit.junit.xml' },
      { type: 'html', file: 'wcag-audit.html' },
      { type: 'dashboard', file: 'wcag-audit-dashboard.html' },
      { type: 'markdown', file: 'wcag-audit.md' }
    ],
    suppressions: [],
    metadata: {
      portableToolkit: true,
      siteId: profile.siteId || null,
      generatedFromProfile: Boolean(profile.siteId)
    }
  };
}

export function renderConfigModule(configObject) {
  return `// Generated / maintained for Portable Web Toolkit WCAG Auditor.
// This is an evidence gate — not a WCAG conformance certificate.
export default ${JSON.stringify(configObject, null, 2)};
`;
}

export function starterManualEvidence(projectName = 'site') {
  return {
    schemaVersion: 1,
    project: projectName,
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
        environment: 'Supported OS and browser, keyboard only',
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
        environment: 'Supported OS, browser, and screen reader',
        standards: [
          { document: 'WCAG-2.2', requirement: '1.3.1', level: 'A', mapping: 'conformance' },
          { document: 'WCAG-2.2', requirement: '4.1.2', level: 'A', mapping: 'conformance' }
        ],
        evidence: '',
        notes: '',
        remediation: 'Smoke-test primary routes with a screen reader and record defects.'
      },
      frostGlassContrastCheck()
    ]
  };
}

export async function writeAstroStarterFiles(projectRoot, {
  profile = {},
  force = false,
  includeManualEvidence = true
} = {}) {
  const configPath = path.join(projectRoot, 'wcag-auditor.config.mjs');
  const evidenceDir = path.join(projectRoot, 'wcag-audit');
  const evidencePath = path.join(evidenceDir, 'manual-evidence.json');

  if (!force && (fs.existsSync(configPath) || fs.existsSync(evidencePath))) {
    throw new Error('Starter files already exist. Pass --force to overwrite them.');
  }

  const configObject = buildAstroConfigObject({
    profile,
    projectRoot,
    outputDirectory: '.wcag-audit-results',
    includeManualEvidence
  });

  // Checked-in starter should not hard-code ephemeral output stamps.
  configObject.outputDirectory = '.wcag-audit-results';

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(configPath, renderConfigModule(configObject), 'utf8');
  if (includeManualEvidence) {
    fs.writeFileSync(
      evidencePath,
      `${JSON.stringify(starterManualEvidence(configObject.project.name), null, 2)}\n`,
      'utf8'
    );
  }
  return { configPath, evidencePath: includeManualEvidence ? evidencePath : null };
}

export function writeEphemeralConfig(filePath, configObject) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, renderConfigModule(configObject), 'utf8');
  return filePath;
}
