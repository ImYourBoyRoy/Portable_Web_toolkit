// ./Web_Toolkit/site_snapshots/src/lib/shoot.mjs
/**
 * Browser capture for site-snapshots.
 *
 * Purpose: one repeatable above-the-fold screenshot per page: reduced motion (so animations settle), fonts loaded,
 * consent banners dismissed or hidden, scrolled to the top. Throws on HTTP errors so a broken site never replaces a
 * good snapshot.
 */

import { createRequire } from 'node:module';
import path from 'node:path';

export function resolveFromProject(projectRoot, name) {
  const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));
  try {
    return requireFromProject(name);
  } catch {
    throw new Error(`site-snapshots needs "${name}" in the project: npm install -D ${name}${name === 'playwright' ? ' && npx playwright install chromium' : ''}`);
  }
}

export async function captureOne(browser, item, config) {
  const context = await browser.newContext({
    viewport: config.viewport,
    deviceScaleFactor: 1,
    colorScheme: config.colorScheme,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(item.url, { waitUntil: 'load', timeout: 30_000 });
    if (!response || response.status() >= 400) throw new Error(`HTTP ${response ? response.status() : 'no response'}`);
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(Number(item.options.waitMs ?? config.settleMs));

    const labels = [...(config.dismissLabels || []), ...(item.options.dismiss || [])];
    for (const label of labels) {
      const button = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
      if (await button.isVisible({ timeout: 250 }).catch(() => false)) {
        await button.click({ timeout: 800 }).catch(() => {});
        await page.waitForTimeout(400);
        break;
      }
    }
    const hide = item.options.hideSelectors || [];
    if (hide.length) await page.addStyleTag({ content: `${hide.join(',')} { display: none !important; }` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const buffer = await page.screenshot({ type: 'jpeg', quality: config.quality, fullPage: Boolean(item.options.fullPage) });
    return { buffer, finalUrl: page.url() };
  } finally {
    await context.close();
  }
}
