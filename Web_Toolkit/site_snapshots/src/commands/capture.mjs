// ./Web_Toolkit/site_snapshots/src/commands/capture.mjs
/**
 * `site-snapshots capture`: photograph each page and update the images and manifest.
 *
 * Writes <outputDir>/<id>.jpg only when the page changed visibly (or the file is missing), so reruns do not churn git.
 * A failed capture keeps the previous image and records the error. Dry run unless --apply.
 * Flags: --only <id>, --stale-only (skip snapshots younger than maxAgeDays), --allow-loopback, --apply.
 * Exit codes: 0 all pages captured or unchanged; 2 some pages failed (old images kept); 1 failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { assertPublicHttpUrl } from '../../../shared/lib/url-safety.mjs';
import { distance, signature } from '../lib/diff.mjs';
import { loadConfig, extractItems } from '../lib/config.mjs';
import { captureOne, resolveFromProject } from '../lib/shoot.mjs';

const DAY_MS = 86_400_000;

export async function runCapture(flags = {}) {
  const projectRoot = path.resolve(String(flags['project-root'] || process.cwd()));
  const { config } = loadConfig(projectRoot, flags);
  const apply = Boolean(flags.apply);
  const only = flags.only ? String(flags.only) : '';
  const manifestPath = path.resolve(projectRoot, config.manifest);
  const outDir = path.resolve(projectRoot, config.outputDir);
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { items: {} };
  manifest.items ||= {};

  let items = extractItems(projectRoot, config);
  if (only) items = items.filter((item) => item.id === only);
  if (flags['stale-only']) {
    items = items.filter((item) => {
      const entry = manifest.items[item.id];
      return !entry?.capturedAt || Date.now() - Date.parse(entry.capturedAt) > config.maxAgeDays * DAY_MS || !fs.existsSync(path.join(outDir, `${item.id}.jpg`));
    });
  }
  if (items.length === 0) {
    console.log('[site-snapshots] nothing to capture.');
    return 0;
  }
  console.log(`[site-snapshots] ${items.length} page(s) -> ${path.relative(projectRoot, outDir)}${apply ? '' : ' (dry run, pass --apply to write)'}`);
  if (!apply) {
    for (const item of items) console.log(`  ${item.id}  ${item.url}`);
    return 0;
  }

  const sharp = resolveFromProject(projectRoot, 'sharp');
  const { chromium } = resolveFromProject(projectRoot, 'playwright');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const failures = [];
  let changed = 0;
  try {
    for (const item of items) {
      const target = path.join(outDir, `${item.id}.jpg`);
      try {
        assertPublicHttpUrl(item.url, `${item.id} url`, { allowLoopback: Boolean(flags['allow-loopback']) });
        const { buffer, finalUrl } = await captureOne(browser, item, config);
        const previous = fs.existsSync(target) ? fs.readFileSync(target) : null;
        const moved = previous ? distance(await signature(sharp, previous), await signature(sharp, buffer)) : 1;
        const now = new Date().toISOString();
        const meta = await sharp(buffer).metadata();
        if (!previous || moved > 0.004) {
          fs.writeFileSync(target, buffer);
          manifest.items[item.id] = { url: item.url, finalUrl, file: `${item.id}.jpg`, width: meta.width, height: meta.height, bytes: buffer.length, capturedAt: now, checkedAt: now, status: 'ok' };
          changed += 1;
          console.log(`  updated  ${item.id} (${previous ? `${(moved * 100).toFixed(1)}% change` : 'new'})`);
        } else {
          manifest.items[item.id] = { ...manifest.items[item.id], checkedAt: now, status: 'ok' };
          console.log(`  same     ${item.id}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        manifest.items[item.id] = { ...(manifest.items[item.id] || { url: item.url, file: `${item.id}.jpg` }), status: 'error', error: message, checkedAt: new Date().toISOString() };
        failures.push({ id: item.id, error: message });
        console.warn(`  failed   ${item.id}: ${message} (kept previous image)`);
      }
    }
  } finally {
    await browser.close();
  }
  if (changed > 0 || failures.length > 0) manifest.generatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[site-snapshots] ${changed} updated, ${items.length - changed - failures.length} unchanged, ${failures.length} failed`);
  return failures.length ? 2 : 0;
}
