// ./Web_Toolkit/site_snapshots/src/commands/check.mjs
/**
 * `site-snapshots check`: report which stored snapshots no longer match the live pages.
 *
 * Reports missing images, snapshots older than maxAgeDays, and visible drift (mean difference above driftThreshold).
 * Writes nothing. Run it before a deploy, then `capture --apply` for anything it lists.
 * Exit codes: 0 all current; 2 stale, drifted or missing snapshots; 1 failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { assertPublicHttpUrl } from '../../../shared/lib/url-safety.mjs';
import { distance, signature } from '../lib/diff.mjs';
import { loadConfig, extractItems } from '../lib/config.mjs';
import { captureOne, resolveFromProject } from '../lib/shoot.mjs';

const DAY_MS = 86_400_000;

export async function runCheck(flags = {}) {
  const projectRoot = path.resolve(String(flags['project-root'] || process.cwd()));
  const { config } = loadConfig(projectRoot, flags);
  const outDir = path.resolve(projectRoot, config.outputDir);
  const manifestPath = path.resolve(projectRoot, config.manifest);
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { items: {} };
  const sharp = resolveFromProject(projectRoot, 'sharp');
  const { chromium } = resolveFromProject(projectRoot, 'playwright');

  const report = { schemaVersion: 'site-snapshots-check-v1', missing: [], stale: [], drift: [], errors: [], current: [] };
  const browser = await chromium.launch();
  try {
    for (const item of extractItems(projectRoot, config)) {
      const file = path.join(outDir, `${item.id}.jpg`);
      if (!fs.existsSync(file)) { report.missing.push(item.id); continue; }
      const capturedAt = manifest.items?.[item.id]?.capturedAt;
      const ageDays = capturedAt ? Math.floor((Date.now() - Date.parse(capturedAt)) / DAY_MS) : null;
      try {
        assertPublicHttpUrl(item.url, `${item.id} url`, { allowLoopback: Boolean(flags['allow-loopback']) });
        const { buffer } = await captureOne(browser, item, config);
        const moved = distance(await signature(sharp, fs.readFileSync(file)), await signature(sharp, buffer));
        if (moved > config.driftThreshold) report.drift.push({ id: item.id, change: Number((moved * 100).toFixed(1)) });
        else if (ageDays === null || ageDays > config.maxAgeDays) report.stale.push({ id: item.id, ageDays });
        else report.current.push(item.id);
      } catch (error) {
        report.errors.push({ id: item.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    await browser.close();
  }
  const status = report.missing.length || report.stale.length || report.drift.length ? 'fail' : 'pass';
  console.log(JSON.stringify({ ...report, status, thresholds: { maxAgeDays: config.maxAgeDays, driftPercent: config.driftThreshold * 100 } }, null, 2));
  return status === 'fail' ? 2 : 0;
}
