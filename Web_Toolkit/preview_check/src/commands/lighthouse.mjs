// ./Web_Toolkit/preview_check/src/commands/lighthouse.mjs
/**
 * `preview-check lighthouse`: run Lighthouse against a local preview or any URL and print compact JSON.
 *
 * Purpose: measure a build before deploy (PageSpeed Insights can only see a public URL). Scores, core metrics and
 * the audits that scored below 0.9 go to stdout; the raw reports are written under output/preview-check/.
 * Needs Lighthouse available through `npx` (installed on first use) and a Chrome/Chromium (set CHROME_PATH if needed).
 * Exit codes: 0 all categories at or above --min (default 90); 2 below the threshold; 1 failure.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseRoutes, resolveBase, slugForRoute } from '../lib/browser.mjs';

const SKIP_DISPLAY_MODES = new Set(['informative', 'manual', 'notApplicable']);

function summarize(report) {
  const audits = report.audits || {};
  const metric = (id) => audits[id]?.displayValue ?? null;
  return {
    scores: Object.fromEntries(Object.entries(report.categories || {}).map(([key, value]) => [key, Math.round((value.score ?? 0) * 100)])),
    metrics: {
      fcp: metric('first-contentful-paint'),
      lcp: metric('largest-contentful-paint'),
      tbt: metric('total-blocking-time'),
      cls: metric('cumulative-layout-shift'),
      speedIndex: metric('speed-index'),
    },
    failedAudits: Object.values(audits)
      .filter((audit) => audit.score !== null && audit.score < 0.9 && !SKIP_DISPLAY_MODES.has(audit.scoreDisplayMode))
      .map((audit) => ({ id: audit.id, score: Math.round(audit.score * 100), detail: audit.displayValue || '' })),
  };
}

export async function runLighthouse(flags = {}) {
  const projectRoot = path.resolve(String(flags['project-root'] || process.cwd()));
  const base = resolveBase(flags);
  const routes = parseRoutes(flags.routes);
  const strategies = String(flags.strategy || 'both') === 'both' ? ['mobile', 'desktop'] : [String(flags.strategy)];
  const min = Number(flags.min ?? 90);
  const outDir = path.join(projectRoot, 'output', 'preview-check');
  fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  for (const route of routes) {
    for (const strategy of strategies) {
      const reportPath = path.join(outDir, `lighthouse-${slugForRoute(route)}-${strategy}.json`);
      const args = [
        '--yes', 'lighthouse', `${base}${route}`,
        '--quiet',
        '--only-categories=performance,accessibility,best-practices,seo',
        ...(strategy === 'desktop' ? ['--preset=desktop'] : []),
        '--output=json', `--output-path=${reportPath}`,
        '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage',
      ];
      const run = spawnSync('npx', args, { cwd: projectRoot, encoding: 'utf8', env: process.env, shell: process.platform === 'win32' });
      if (!fs.existsSync(reportPath)) {
        results.push({ route, strategy, ok: false, error: (run.stderr || run.stdout || 'Lighthouse produced no report').slice(0, 400) });
        continue;
      }
      const summary = summarize(JSON.parse(fs.readFileSync(reportPath, 'utf8')));
      const low = Object.entries(summary.scores).filter(([, score]) => score < min).map(([name]) => name);
      results.push({ route, strategy, ok: low.length === 0, below: low, report: path.relative(projectRoot, reportPath), ...summary });
    }
  }
  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ schemaVersion: 'preview-check-lighthouse-v1', base, min, status: failed.length ? 'fail' : 'pass', results }, null, 2));
  return results.some((result) => result.error) ? 1 : failed.length ? 2 : 0;
}
