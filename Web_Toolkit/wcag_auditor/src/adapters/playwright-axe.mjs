import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AdapterError } from '../core/errors.mjs';
import { ensureDirectory, normalizePath } from '../core/filesystem.mjs';
import { importOptional } from '../core/dependencies.mjs';
import { startManagedWebServer } from '../core/web-server.mjs';

const DEFAULT_RUN_ONLY = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

export async function runPlaywrightAxeAdapter(config, context) {
  const managedServer = await startManagedWebServer(config.webServer, context, config.baseURL);
  try {
    const playwright = context.modules?.playwright
      ?? await importOptional('playwright', 'the rendered browser accessibility adapter', context.importModule);
    const axeModule = context.modules?.axePlaywright
      ?? await importOptional('@axe-core/playwright', 'the rendered browser accessibility adapter', context.importModule);
    const AxeBuilder = axeModule.AxeBuilder ?? axeModule.default;
    if (typeof AxeBuilder !== 'function') throw new AdapterError('@axe-core/playwright did not expose AxeBuilder');

    const browserName = config.browser ?? 'chromium';
    // Package-name import exposes browsers on the namespace; file-URL import
    // (createProjectImporter) often nests them under .default (CJS interop).
    const browserType = playwright?.[browserName] ?? playwright?.default?.[browserName];
    if (!browserType || typeof browserType.launch !== 'function') {
      throw new AdapterError(`Unsupported Playwright browser: ${browserName}`);
    }
    if (!Array.isArray(config.scenarios) || config.scenarios.length === 0) {
      throw new AdapterError('playwright-axe adapter requires at least one scenario');
    }

    const browser = await browserType.launch(config.launchOptions ?? {});
    const browserContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ...config.contextOptions
    });

    const findings = [];
    let surfaceCount = 0;
    const scenarios = [];
    try {
      for (const scenario of config.scenarios) {
        const result = await runScenario({
          scenario,
          config,
          context,
          browserContext,
          AxeBuilder
        });
        findings.push(...result.findings);
        surfaceCount += result.surfaceCount;
        scenarios.push(result.metadata);
      }
    } finally {
      try {
        await browserContext.close();
      } finally {
        await browser.close();
      }
    }

    return {
      findings,
      surfaceCount,
      metadata: { browser: browserName, scenarios, webServer: managedServer.metadata }
    };
  } finally {
    await managedServer.close();
  }
}

async function runScenario({ scenario, config, context, browserContext, AxeBuilder }) {
  if (!scenario || typeof scenario !== 'object') throw new AdapterError('Each Playwright scenario must be an object');
  if (typeof scenario.name !== 'string' || scenario.name.trim() === '') throw new AdapterError('Each Playwright scenario requires name');

  const page = await browserContext.newPage();
  const findings = [];
  const started = Date.now();
  try {
    const url = scenario.url ?? resolveScenarioUrl(config.baseURL, scenario.path);
    await page.goto(url, { waitUntil: scenario.waitUntil ?? 'domcontentloaded', timeout: scenario.timeoutMs ?? config.timeoutMs ?? 30_000 });
    if (typeof scenario.setup === 'function') await scenario.setup(page, context);
    for (const step of scenario.steps ?? []) await executeStep(page, step);

    let builder = new AxeBuilder({ page });
    const runOnly = scenario.runOnly ?? config.runOnly ?? DEFAULT_RUN_ONLY;
    if (runOnly.length > 0 && typeof builder.withTags === 'function') builder = builder.withTags(runOnly);
    for (const selector of scenario.include ?? config.include ?? []) builder = builder.include(selector);
    for (const selector of scenario.exclude ?? config.exclude ?? []) builder = builder.exclude(selector);
    if (scenario.axeOptions ?? config.axeOptions) builder = builder.options(scenario.axeOptions ?? config.axeOptions);

    const axeResults = await builder.analyze();
    const axeFindings = mapAxeResults(axeResults, {
      adapterName: context.adapterName,
      scenarioName: scenario.name,
      url
    });
    findings.push(...axeFindings);
    let probeSurface = 0;
    const targetProbe = scenario.probes?.targetSizeEnhanced ?? config.probes?.targetSizeEnhanced;
    if (targetProbe?.enabled) {
      const probeResult = await runTargetSizeProbe(page, targetProbe, context.adapterName, scenario.name);
      findings.push(...probeResult.findings);
      probeSurface += probeResult.surfaceCount;
    }

    const focusProbe = scenario.probes?.focusIndicatorReview ?? config.probes?.focusIndicatorReview;
    if (focusProbe?.enabled) {
      const probeResult = await runFocusIndicatorProbe(page, focusProbe, context.adapterName, scenario.name);
      findings.push(...probeResult.findings);
      probeSurface += probeResult.surfaceCount;
    }

    let screenshot;
    if ((scenario.screenshotOnFinding ?? config.screenshotOnFinding) && findings.some((finding) => finding.outcome !== 'passed')) {
      screenshot = await captureScenarioScreenshot(page, context, scenario.name);
      for (const finding of findings) {
        if (!finding.evidence || typeof finding.evidence !== 'object') finding.evidence = { value: finding.evidence };
        finding.evidence.screenshot = screenshot;
      }
    }

    const axeSurface = surfaceCountFromAxe(axeResults);
    return {
      findings,
      surfaceCount: Math.max(axeSurface, 1) + probeSurface,
      metadata: {
        name: scenario.name,
        url,
        durationMs: Date.now() - started,
        axe: {
          violations: axeResults.violations?.length ?? 0,
          incomplete: axeResults.incomplete?.length ?? 0,
          passes: axeResults.passes?.length ?? 0,
          inapplicable: axeResults.inapplicable?.length ?? 0
        },
        screenshot
      }
    };
  } catch (error) {
    throw new AdapterError(`Playwright scenario "${scenario.name}" failed: ${error.message}`, { scenario: scenario.name }, error);
  } finally {
    try {
      if (typeof scenario.teardown === 'function') await scenario.teardown(page, context);
    } finally {
      await page.close();
    }
  }
}

function mapAxeResults(results, target) {
  const findings = [];
  for (const violation of results.violations ?? []) {
    for (const node of violation.nodes ?? []) {
      findings.push(mapAxeNode(violation, node, 'failed', target));
    }
  }
  for (const incomplete of results.incomplete ?? []) {
    for (const node of incomplete.nodes ?? []) {
      findings.push(mapAxeNode(incomplete, node, 'cantTell', target));
    }
  }
  return findings;
}

function mapAxeNode(rule, node, outcome, target) {
  const tags = [...new Set(rule.tags ?? [])].sort();
  return {
    ruleId: `axe/${rule.id}`,
    ruleVersion: 'axe-core',
    title: rule.help ?? rule.id,
    description: rule.description ?? '',
    outcome,
    severity: mapImpact(rule.impact ?? node.impact),
    confidence: outcome === 'failed' ? 'high' : 'medium',
    automation: outcome === 'failed' ? 'automatic' : 'semi-automatic',
    target: {
      adapter: target.adapterName,
      routeOrScene: target.scenarioName,
      state: target.url,
      selectorOrNode: node.target
    },
    standards: standardsFromAxeTags(tags),
    evidence: {
      id: rule.id,
      impact: rule.impact ?? node.impact,
      html: node.html,
      failureSummary: node.failureSummary,
      any: node.any,
      all: node.all,
      none: node.none
    },
    remediation: rule.help ?? '',
    helpUrl: rule.helpUrl,
    tags: ['axe-core', ...tags]
  };
}

function standardsFromAxeTags(tags) {
  const standards = [];
  for (const tag of tags) {
    const match = /^wcag(\d)(\d)(\d+)$/.exec(tag);
    if (!match) continue;
    standards.push({
      document: 'WCAG-2.2',
      requirement: `${match[1]}.${match[2]}.${match[3]}`,
      mapping: 'secondary'
    });
  }
  return standards;
}

function mapImpact(impact) {
  return {
    critical: 'critical',
    serious: 'serious',
    moderate: 'moderate',
    minor: 'minor'
  }[impact] ?? 'moderate';
}

function surfaceCountFromAxe(results) {
  const groups = ['violations', 'incomplete', 'passes', 'inapplicable'];
  return groups.reduce((total, key) => total + (results[key] ?? []).reduce((count, rule) => count + (rule.nodes?.length ?? 0), 0), 0);
}

async function runTargetSizeProbe(page, options, adapterName, scenarioName) {
  const minimum = positiveInteger(options.minimum, 44, 'targetSizeEnhanced.minimum');
  const selector = options.selector ?? [
    'button',
    'a[href]',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const targets = await page.evaluate(({ selector: query, minimum: min, ignoreSelector }) => {
    function cssPath(element) {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
        let part = current.localName;
        const parent = current.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((candidate) => candidate.localName === current.localName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(' > ');
    }

    return [...document.querySelectorAll(query)].flatMap((element) => {
      if (ignoreSelector && element.matches(ignoreSelector)) return [];
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const hidden = style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity) === 0
        || rect.width <= 0
        || rect.height <= 0
        || element.closest('[aria-hidden="true"]');
      const disabled = element.matches(':disabled,[aria-disabled="true"]');
      if (hidden || disabled) return [];
      return [{
        selector: cssPath(element),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
        belowMinimum: rect.width < min || rect.height < min,
        text: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 120)
      }];
    });
  }, { selector, minimum, ignoreSelector: options.ignoreSelector ?? null });

  const findings = targets.filter((target) => target.belowMinimum).map((target) => ({
    ruleId: 'wcag-auditor/runtime/target-size-enhanced',
    title: 'Rendered target is below the enhanced size policy',
    description: `Rendered size is ${target.width} × ${target.height} CSS px; configured minimum is ${minimum} × ${minimum}.`,
    outcome: 'failed',
    severity: options.severity ?? 'moderate',
    confidence: 'medium',
    automation: 'automatic',
    target: {
      adapter: adapterName,
      routeOrScene: scenarioName,
      selectorOrNode: target.selector
    },
    standards: [
      { document: 'WCAG-2.2', requirement: '2.5.5', level: 'AAA', mapping: 'secondary' },
      { document: 'INTERNAL', requirement: 'rendered-target-size-enhanced', mapping: 'policy' }
    ],
    evidence: target,
    remediation: `Increase the rendered target to at least ${minimum} × ${minimum} CSS px or document the applicable exception.`,
    helpUrl: 'https://www.w3.org/TR/WCAG22/#target-size-enhanced',
    tags: ['geometry', 'runtime-probe', 'target-size']
  }));
  return { findings, surfaceCount: targets.length };
}

async function runFocusIndicatorProbe(page, options, adapterName, scenarioName) {
  const maxTabs = positiveInteger(options.maxTabs, 80, 'focusIndicatorReview.maxTabs');
  const findings = [];
  const seen = new Set();
  let surfaceCount = 0;

  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press('Tab');
    // Scroll focused control into view. Force scroll-behavior:auto — smooth scrolling
    // can no-op programmatic scrollTop/scrollTo in headless Chromium.
    await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body || element === document.documentElement) return;
      const root = document.documentElement;
      const previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      const rect = element.getBoundingClientRect();
      const absoluteTop = rect.top + window.scrollY;
      const target = Math.max(0, absoluteTop - (window.innerHeight / 2) + (rect.height / 2));
      window.scrollTo(0, target);
      root.style.scrollBehavior = previousBehavior;
    });
    const snapshot = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body || element === document.documentElement) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < innerHeight
        && rect.left < innerWidth;
      const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
      const obviousIndicator = (outlineWidth > 0 && style.outlineStyle !== 'none' && style.outlineColor !== 'transparent')
        || (style.boxShadow !== 'none' && style.boxShadow !== '');
      const selector = element.id
        ? `#${CSS.escape(element.id)}`
        : `${element.localName}${element.getAttribute('name') ? `[name="${CSS.escape(element.getAttribute('name'))}"]` : ''}`;
      return {
        selector,
        role: element.getAttribute('role') || element.localName,
        name: (element.getAttribute('aria-label') || element.textContent || element.getAttribute('name') || '').trim().slice(0, 120),
        visible,
        obviousIndicator,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    });

    if (!snapshot) break;
    const key = `${snapshot.selector}|${snapshot.name}`;
    if (seen.has(key)) break;
    seen.add(key);
    surfaceCount += 1;
    if (!snapshot.visible || !snapshot.obviousIndicator) {
      findings.push({
        ruleId: 'wcag-auditor/runtime/focus-indicator-review',
        title: 'Keyboard focus indicator requires manual review',
        description: snapshot.visible
          ? 'The runtime probe did not detect an outline or box-shadow focus indicator.'
          : 'The focused element was not fully visible in the viewport.',
        outcome: 'cantTell',
        severity: options.severity ?? 'serious',
        confidence: 'medium',
        automation: 'semi-automatic',
        target: {
          adapter: adapterName,
          routeOrScene: scenarioName,
          selectorOrNode: snapshot.selector
        },
        standards: [
          { document: 'WCAG-2.2', requirement: '2.4.7', level: 'AA', mapping: 'secondary' },
          { document: 'WCAG-2.2', requirement: '2.4.13', level: 'AAA', mapping: 'secondary' },
          { document: 'INTERNAL', requirement: 'focus-indicator-review', mapping: 'policy' }
        ],
        evidence: snapshot,
        remediation: 'Inspect the focused state visually and verify visibility, area, and contrast requirements.',
        helpUrl: 'https://www.w3.org/TR/WCAG22/#focus-visible',
        tags: ['focus', 'keyboard', 'runtime-probe', 'manual-review']
      });
    }
  }
  return { findings, surfaceCount };
}

async function executeStep(page, step) {
  if (typeof step === 'function') {
    await step(page);
    return;
  }
  if (!step || typeof step !== 'object') throw new AdapterError('Playwright steps must be functions or objects');
  const locator = step.selector ? page.locator(step.selector) : null;
  switch (step.action) {
    case 'click':
      await requireLocator(locator, step).click(step.options);
      break;
    case 'fill':
      await requireLocator(locator, step).fill(String(step.value ?? ''), step.options);
      break;
    case 'press':
      await requireLocator(locator, step).press(String(step.key), step.options);
      break;
    case 'check':
      await requireLocator(locator, step).check(step.options);
      break;
    case 'uncheck':
      await requireLocator(locator, step).uncheck(step.options);
      break;
    case 'selectOption':
      await requireLocator(locator, step).selectOption(step.value, step.options);
      break;
    case 'waitFor':
    case 'expectVisible':
      await requireLocator(locator, step).waitFor({ state: step.action === 'expectVisible' ? 'visible' : step.state, ...step.options });
      break;
    case 'waitForURL':
      await page.waitForURL(step.url, step.options);
      break;
    case 'waitForTimeout': {
      const milliseconds = positiveInteger(step.milliseconds, 1, 'waitForTimeout.milliseconds');
      if (milliseconds > 10_000) throw new AdapterError('waitForTimeout is limited to 10,000 ms');
      await page.waitForTimeout(milliseconds);
      break;
    }
    case 'setViewport':
      await page.setViewportSize({ width: positiveInteger(step.width, 1, 'setViewport.width'), height: positiveInteger(step.height, 1, 'setViewport.height') });
      break;
    default:
      throw new AdapterError(`Unsupported Playwright step action: ${step.action}`);
  }
}

function requireLocator(locator, step) {
  if (!locator) throw new AdapterError(`Playwright step ${step.action} requires selector`);
  return locator;
}

function resolveScenarioUrl(baseURL, scenarioPath) {
  if (!baseURL) throw new AdapterError('playwright-axe adapter requires baseURL unless every scenario supplies url');
  if (typeof scenarioPath !== 'string') throw new AdapterError('Playwright scenario requires path or url');
  return new URL(scenarioPath, ensureTrailingSlash(baseURL)).href;
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

async function captureScenarioScreenshot(page, context, scenarioName) {
  const directory = path.join(context.outputDirectory, 'screenshots');
  await ensureDirectory(directory);
  const safeName = scenarioName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'scenario';
  const file = path.join(directory, `${safeName}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return normalizePath(path.relative(context.projectRoot, file));
}

function positiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) throw new AdapterError(`${name} must be a positive integer`);
  return value;
}
