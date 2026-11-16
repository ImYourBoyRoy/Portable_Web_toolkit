// ./Web_Toolkit/wcag_auditor/src/toolkit/overlays.mjs
/**
 * Run overlays for the WCAGate engine: routes, sitemap discovery, color-scheme/viewport matrix, baseline ratchet.
 *
 * The engine owns the behavior (WCAGate 2.4+). This module maps wrapper flags and site-profile
 * `diagnostics.wcagAuditor` options onto the engine API and fails closed with an actionable message when the
 * installed engine is too old, instead of silently ignoring a flag that changes what the gate covers.
 */

import path from 'node:path';

export const DEFAULT_BASELINE_FILE = 'wcag-audit/baseline.json';

/** Engine features the wrapper can rely on, detected from the loaded API (never from a version string). */
export function detectEngineFeatures(api = {}) {
  const has = (name) => typeof api[name] === 'function';
  return {
    matrix: has('expandScenarioMatrix'),
    sitemap: has('routesFromSitemap'),
    baseline: has('readBaseline') && has('createBaseline') && has('writeBaseline') && has('applyBaseline'),
    probes: has('expandScenarioMatrix'), // reflow, textSpacing, contrastResolution ship together with the matrix
    agent: has('renderAgentReport') && has('readPreviousRun') && has('groupDetail') // grouped token-lean report, `report`, delta
  };
}

function listFrom(value) {
  if (value === undefined || value === null || value === true) return [];
  return (Array.isArray(value) ? value : String(value).split(',')).map((item) => String(item).trim()).filter(Boolean);
}

/** Normalizes flags + profile options into one request. Flags win over the profile. */
export function requestedOverlays(flags = {}, profile = {}) {
  const wcag = profile?.diagnostics?.wcagAuditor ?? {};
  const routes = flags.routes !== undefined && flags.routes !== true ? listFrom(flags.routes) : null;
  const sitemapFlag = flags.sitemap;
  const wantsSitemap = !routes && (sitemapFlag !== undefined || wcag.sitemap === true);
  const baselineFlag = flags.baseline !== undefined ? flags.baseline : wcag.baseline;
  const writeFlag = flags['write-baseline'];
  return {
    routes,
    sitemap: wantsSitemap
      ? { source: typeof sitemapFlag === 'string' ? sitemapFlag : (typeof wcag.sitemapUrl === 'string' ? wcag.sitemapUrl : undefined) }
      : null,
    maxRoutes: Number.parseInt(String(flags['max-routes'] ?? wcag.maxRoutes ?? 50), 10),
    colorSchemes: listFrom(flags['color-schemes'] ?? wcag.matrix?.colorSchemes),
    viewports: listFrom(flags.viewports ?? wcag.matrix?.viewports),
    baseline: baselineFlag === undefined || baselineFlag === false ? null : (baselineFlag === true ? DEFAULT_BASELINE_FILE : String(baselineFlag)),
    writeBaseline: writeFlag === undefined || writeFlag === false ? null : (writeFlag === true ? DEFAULT_BASELINE_FILE : String(writeFlag))
  };
}

function requireFeature(api, feature, flagLabel, available) {
  if (available) return;
  const version = api?.TOOLKIT_VERSION ?? 'unknown';
  throw new Error(
    `${flagLabel} needs WCAGate 2.4 or newer; the installed engine is ${version} (missing ${feature}). `
    + 'Run `wcag-auditor run --update-engine` (or `cd Web_Toolkit && pnpm install`) and retry.'
  );
}

/**
 * Applies overlays to a loaded (normalized) config and loads the baseline when requested.
 * @returns {Promise<{ baseline?: { file: string, document: object }, writeBaseline: string | null, request: object }>}
 */
export async function applyOverlays({ api, config, flags = {}, profile = {}, projectRoot, log = () => {} }) {
  const request = requestedOverlays(flags, profile);
  const features = detectEngineFeatures(api);
  const overlays = {};

  if (request.sitemap) {
    requireFeature(api, 'routesFromSitemap', '--sitemap', features.sitemap);
    const baseUrl = flags['base-url'] ? String(flags['base-url']) : api.firstBaseUrl?.(config);
    if (!baseUrl) throw new Error('--sitemap needs --base-url or an adapter baseURL to know which origin to audit.');
    const found = await api.routesFromSitemap({ baseUrl, source: request.sitemap.source, limit: request.maxRoutes });
    request.routes = found.routes;
    log(`sitemap ${found.source}: ${found.routes.length} route(s)${found.truncated ? ' (truncated; raise --max-routes)' : ''}`);
  }
  if (request.routes?.length) overlays.routes = request.routes;
  if (request.colorSchemes.length > 0 || request.viewports.length > 0) {
    requireFeature(api, 'expandScenarioMatrix', '--color-schemes/--viewports', features.matrix);
    if (request.colorSchemes.length > 0) overlays.colorSchemes = request.colorSchemes;
    if (request.viewports.length > 0) overlays.viewports = request.viewports;
  }
  if (Object.keys(overlays).length > 0) api.applyRunOverrides(config, overlays);

  let baseline;
  if (request.baseline) {
    requireFeature(api, 'readBaseline', '--baseline', features.baseline);
    const file = path.resolve(projectRoot, request.baseline);
    baseline = { file: request.baseline, document: await api.readBaseline(file) };
  }
  if (request.writeBaseline) requireFeature(api, 'writeBaseline', '--write-baseline', features.baseline);
  return { baseline, writeBaseline: request.writeBaseline, request };
}

/** Writes the baseline after a run when requested. Returns the entry count or null. */
export async function finishOverlays({ api, run, overlays, projectRoot, log = () => {} }) {
  if (run.baseline) {
    log(`baseline ${run.baseline.file}: ${run.baseline.known} known (not blocking), ${run.baseline.new} new, ${run.baseline.fixed} fixed`);
  }
  if (!overlays.writeBaseline) return null;
  const document = api.createBaseline(run);
  await api.writeBaseline(path.resolve(projectRoot, overlays.writeBaseline), document);
  log(`baseline written → ${overlays.writeBaseline} (${document.entries.length} known finding(s))`);
  return document.entries.length;
}

/** Arguments to forward to the engine CLI when no profile/config wrapper path is used. */
export function engineCliArgs(flags = {}) {
  const args = [];
  const value = (name) => {
    if (flags[name] !== undefined && flags[name] !== true) args.push(`--${name}`, String(flags[name]));
  };
  for (const name of ['base-url', 'routes', 'max-routes', 'color-schemes', 'viewports']) value(name);
  if (flags.sitemap === true) args.push('--sitemap');
  else if (flags.sitemap !== undefined) args.push('--sitemap', String(flags.sitemap));
  for (const name of ['baseline', 'write-baseline']) {
    if (flags[name] === true) args.push(`--${name}`, DEFAULT_BASELINE_FILE);
    else value(name);
  }
  if (flags['skip-playwright-install']) args.push('--skip-playwright-install');
  return args;
}
