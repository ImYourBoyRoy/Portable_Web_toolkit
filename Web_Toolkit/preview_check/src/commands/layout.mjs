// ./Web_Toolkit/preview_check/src/commands/layout.mjs
/**
 * `preview-check layout`: find horizontal overflow at phone, tablet and desktop widths.
 *
 * Purpose: catch the layout bugs that only show on small screens, such as a `1fr` grid stretched by a
 * `white-space: nowrap` code block, before they ship. Reports the first offending elements per width.
 * Exit codes: 0 no overflow; 2 overflow found; 1 failure.
 */

import path from 'node:path';
import { parseRoutes, resolveBase, withBrowser } from '../lib/browser.mjs';

const DEFAULT_WIDTHS = [375, 768, 1440];

export async function runLayoutCheck(flags = {}) {
  const projectRoot = path.resolve(String(flags['project-root'] || process.cwd()));
  const base = resolveBase(flags);
  const routes = parseRoutes(flags.routes);
  const widths = String(flags.widths || DEFAULT_WIDTHS.join(',')).split(',').map(Number).filter(Boolean);

  const results = await withBrowser(projectRoot, async (browser) => {
    const out = [];
    for (const width of widths) {
      // A plain (non-mobile) viewport keeps innerWidth fixed, so overflow is measurable instead of widening the layout viewport.
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      for (const route of routes) {
        await page.goto(`${base}${route}`, { waitUntil: 'load' });
        await page.waitForTimeout(Number(flags['settle-ms'] || 600));
        const result = await page.evaluate((viewportWidth) => {
          const scrollWidth = document.documentElement.scrollWidth;
          const offenders = [];
          if (scrollWidth > viewportWidth + 1) {
            // Fixed overlays (off-canvas menus, backgrounds) never widen the document, so skip their subtrees.
            const insideFixed = (node) => {
              for (let cursor = node; cursor && cursor !== document.body; cursor = cursor.parentElement) {
                if (getComputedStyle(cursor).position === 'fixed') return true;
              }
              return false;
            };
            for (const el of document.querySelectorAll('body *')) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.right > viewportWidth + 1 && !insideFixed(el)) {
                offenders.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''} right=${Math.round(rect.right)}`);
                if (offenders.length >= 12) break;
              }
            }
          }
          return { scrollWidth, overflow: scrollWidth > viewportWidth + 1, offenders };
        }, width);
        out.push({ route, width, ...result });
      }
      await context.close();
    }
    return out;
  });

  const failed = results.filter((result) => result.overflow);
  console.log(JSON.stringify({ schemaVersion: 'preview-check-layout-v1', base, status: failed.length ? 'fail' : 'pass', checked: results.length, failed }, null, 2));
  return failed.length ? 2 : 0;
}
