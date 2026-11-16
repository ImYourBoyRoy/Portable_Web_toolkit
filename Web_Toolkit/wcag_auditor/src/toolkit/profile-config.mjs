// ./Web_Toolkit/wcag_auditor/src/toolkit/profile-config.mjs
/**
 * Build Astro/site-profile-aware WCAG auditor configs and starter files.
 *
 * Prefer a checked-in `wcag-auditor.config.mjs` in the client project.
 * Use `--from-profile` only for ephemeral profile-driven runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importCore } from './resolve-core.mjs';
import { detectEngineFeatures } from './overlays.mjs';
import { findFreePort, withPort } from '../../../shared/lib/dev-server.mjs';

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
  const script = /^(npm|pnpm|yarn|bun) run preview(?: --)?$/.exec(preview);
  if (script) return [script[1], 'run', 'preview'];
  return null;
}

/** `diagnostics.wcagAuditor.matrix`: { colorSchemes: ['light','dark'], viewports: ['mobile','desktop'] }; null when unset or empty. */

function managesServer(profile, flags) {
  return flags['manage-server'] === true || flags['manage-server'] === 'true' || Boolean(profile.diagnostics?.wcagAuditor?.manageServer);
}

/**
 * The toolkit owns the preview it starts, so it never reuses (or collides with) whatever already listens on the profile's
 * port: 4321 is often the user's own dev server. Returns { port, preferred, busy } or null when no server is managed.
 */
export async function resolveManagedServerPort({ profile = {}, flags = {} } = {}) {
  // An explicit --base-url names a server the caller runs: nothing is chosen or managed for it.
  if (flags['base-url'] || !previewCommandFromProfile(profile) || !managesServer(profile, flags)) return null;
  const url = new URL(baseUrlFromProfile(profile, flags));
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) return null;
  return findFreePort({ preferred: url.port ? Number(url.port) : undefined, host: '127.0.0.1' });
}

/** Flags for the preview script: npm needs `--` before them, the other managers pass them straight through. */
function previewServerArgs(command, args, port) {
  if (args[0] === 'run' && ['npm', 'pnpm', 'yarn', 'bun'].includes(command)) {
    const flagsFor = ['--host', '127.0.0.1', '--port', String(port)];
    return [...args, ...(command === 'npm' ? ['--'] : []), ...flagsFor];
  }
  return withPort(args, port, { append: true });
}

export function matrixFromProfile(profile = {}) {
  const matrix = profile.diagnostics?.wcagAuditor?.matrix;
  if (!matrix || typeof matrix !== 'object') return null;
  const colorSchemes = Array.isArray(matrix.colorSchemes) ? matrix.colorSchemes.map(String) : [];
  const viewports = Array.isArray(matrix.viewports) ? matrix.viewports : [];
  if (colorSchemes.length === 0 && viewports.length === 0) return null;
  return { ...(colorSchemes.length > 0 ? { colorSchemes } : {}), ...(viewports.length > 0 ? { viewports } : {}) };
}

/**
 * Profile-built runs historically ignore unresolved (cantTell/untested) evidence unless manual evidence is wired in.
 * `diagnostics.wcagAuditor.unresolvedEvidence: "error"` makes them fail closed (exit 3) once the project is ready for it.
 */
export function unresolvedEvidenceFromProfile(profile = {}, includeManualEvidence = false) {
  const configured = profile.diagnostics?.wcagAuditor?.unresolvedEvidence;
  if (configured === 'error' || configured === 'ignore') return configured;
  return includeManualEvidence ? 'error' : 'ignore';
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
  includeManualEvidence = false,
  // Detected from the loaded engine (overlays.detectEngineFeatures). Omitted = emit only keys every engine accepts.
  engineFeatures = {},
  // { port } from resolveManagedServerPort: the managed preview runs on this port and is never reused.
  managedServerPort = null
} = {}) {
  const siteId = profile.siteId || profile.branding?.seo?.siteName || path.basename(projectRoot);
  const routes = routesFromProfile(profile);
  let baseURL = baseUrlFromProfile(profile, flags);
  if (managedServerPort) {
    const url = new URL(baseURL);
    url.port = String(managedServerPort.port);
    baseURL = url.origin;
  }
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

  if (previewCommand && managesServer(profile, flags)) {
    const [command, ...args] = previewCommand;
    playwrightAdapter.webServer = {
      command,
      args: managedServerPort ? previewServerArgs(command, args, managedServerPort.port) : args,
      url: baseURL,
      timeoutMs: Number(profile.diagnostics?.wcagAuditor?.serverTimeoutMs || 120000),
      // An owned server on a port chosen free is never "reused"; an explicit base URL keeps the old reuse behavior.
      reuseExistingServer: !managedServerPort
    };
  }

  if (engineFeatures.probes) {
    // WCAGate 2.4+: 1.4.10 reflow and 1.4.12 text spacing run on AA/AAA targets; contrast resolution is automatic.
    const aboveA = profileLevel !== 'wcag22-a';
    playwrightAdapter.probes.reflow = { enabled: aboveA };
    playwrightAdapter.probes.textSpacing = { enabled: aboveA };
  }
  const matrix = matrixFromProfile(profile);
  if (engineFeatures.matrix && matrix) playwrightAdapter.matrix = matrix;

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
      unresolvedEvidence: unresolvedEvidenceFromProfile(profile, includeManualEvidence),
      executionErrors: 'error',
      requireApplicableSurface: true
    },
    reporters: [
      { type: 'console' },
      ...(engineFeatures.agent ? [{ type: 'agent', file: 'agent.md' }] : []),
      { type: 'json', file: 'wcag-audit.json' },
      { type: 'sarif', file: 'wcag-audit.sarif' },
      { type: 'junit', file: 'wcag-audit.junit.xml' },
      { type: 'html', file: 'wcag-audit.html' },
      { type: 'results', file: 'results.html' },
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

export async function starterManualEvidence(projectName = 'site') {
  const { api } = await importCore({ ensure: true });
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
      api.frostGlassContrastCheck()
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

  const { api } = await importCore({ ensure: true });
  const configObject = buildAstroConfigObject({
    profile,
    projectRoot,
    outputDirectory: '.wcag-audit-results',
    includeManualEvidence,
    engineFeatures: detectEngineFeatures(api)
  });

  // Checked-in starter should not hard-code ephemeral output stamps.
  configObject.outputDirectory = '.wcag-audit-results';

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(configPath, renderConfigModule(configObject), 'utf8');
  if (includeManualEvidence) {
    fs.writeFileSync(
      evidencePath,
      `${JSON.stringify(await starterManualEvidence(configObject.project.name), null, 2)}\n`,
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
