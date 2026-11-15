// ./Web_Toolkit/preview_check/src/commands/contrast.mjs
/**
 * `preview-check contrast`: find text that fails WCAG AA contrast in each color scheme.
 *
 * Purpose: catch white-on-pale buttons and dim muted text that axe reports only as "incomplete" on translucent or
 * gradient backgrounds (and that WCAGate therefore lists as cantTell, not a failure). Every visible text node is checked
 * against its resolved background, in dark and light schemes, optionally after clicking an element (for example the mobile menu).
 * Layers with images or gradients are reported as `uncertain` with the best solid estimate, and counted separately.
 * Exit codes: 0 no certain failures; 2 certain failures found; 1 failure.
 */

import path from 'node:path';
import { parseRoutes, resolveBase, withBrowser } from '../lib/browser.mjs';
import { compose, contrastRatio, isLargeText, parseColor, resolveBackground } from '../lib/contrast.mjs';

const rgbText = (rgb) => `rgb(${rgb.map((v) => Math.round(v)).join(',')})`;

export async function runContrast(flags = {}) {
  const projectRoot = path.resolve(String(flags['project-root'] || process.cwd()));
  const base = resolveBase(flags);
  const routes = parseRoutes(flags.routes);
  const schemes = String(flags.schemes || 'dark,light').split(',').map((s) => s.trim()).filter(Boolean);
  const width = Number(flags.width || 1440);
  const clickSelector = flags.click ? String(flags.click) : '';

  const rows = await withBrowser(projectRoot, async (browser) => {
    const out = [];
    for (const scheme of schemes) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      const page = await context.newPage();
      for (const route of routes) {
        await page.goto(`${base}${route}`, { waitUntil: 'load' });
        await page.waitForTimeout(Number(flags['settle-ms'] || 800));
        if (clickSelector) { await page.click(clickSelector).catch(() => {}); await page.waitForTimeout(500); }
        const found = await page.evaluate(() => {
          const results = [];
          const selectorFor = (el) => {
            const own = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
            return own;
          };
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const seen = new Set();
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const text = node.textContent.replace(/\s+/g, ' ').trim();
            if (!text) continue;
            const el = node.parentElement;
            if (!el || seen.has(el) || el.closest('script,style,noscript,.sr-only,[aria-hidden="true"],:disabled,[aria-disabled="true"]')) continue;
            seen.add(el);
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
            // Gradient-clipped text paints the gradient itself; it cannot be measured against a background here.
            if (style.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || style.webkitTextFillColor === 'transparent') continue;
            // effective opacity, and skip anything fully transparent or off-canvas (closed menus)
            let opacity = 1;
            for (let cursor = el; cursor; cursor = cursor.parentElement) opacity *= Number(getComputedStyle(cursor).opacity);
            if (opacity < 0.05 || rect.right < 0 || rect.left > innerWidth || rect.bottom < 0) continue;
            const layers = [];
            for (let cursor = el; cursor; cursor = cursor.parentElement) {
              const cs = getComputedStyle(cursor);
              layers.push({ color: cs.backgroundColor, image: cs.backgroundImage !== 'none', imageText: cs.backgroundImage.slice(0, 500) });
            }
            results.push({ selector: selectorFor(el), text: text.slice(0, 48), color: style.color, opacity, size: parseFloat(style.fontSize), weight: style.fontWeight, layers });
          }
          return results;
        });
        for (const row of found) out.push({ scheme, route, ...row });
      }
      await context.close();
    }
    return out;
  });

  const failures = [];
  const seenKey = new Set();
  for (const row of rows) {
    const text = parseColor(row.color);
    if (!text) continue;
    const background = resolveBackground(row.layers, row.scheme === 'light' ? [244, 244, 248] : [8, 8, 13]);
    const need = isLargeText(row.size, row.weight) ? 3 : 4.5;
    const ratios = background.candidates.map((candidate) => contrastRatio(compose([text[0], text[1], text[2], text[3] * row.opacity], candidate), candidate));
    const worst = Math.min(...ratios);
    const best = Math.max(...ratios);
    if (worst >= need) continue;
    // Every gradient stop fails: certain. Some stops pass: the gradient decides, so report it as uncertain.
    const certain = best < need && !background.uncertain;
    const ratio = worst;
    const fg = compose([text[0], text[1], text[2], text[3] * row.opacity], background.candidates[ratios.indexOf(worst)]);
    background.color = background.candidates[ratios.indexOf(worst)];
    background.uncertain = !certain;
    const key = `${row.scheme}|${row.selector}|${rgbText(fg)}|${rgbText(background.color)}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    failures.push({ scheme: row.scheme, route: row.route, selector: row.selector, text: row.text, ratio: Number(ratio.toFixed(2)), need, foreground: rgbText(fg), background: rgbText(background.color), uncertain: background.uncertain });
  }
  const certain = failures.filter((failure) => !failure.uncertain);
  console.log(JSON.stringify({
    schemaVersion: 'preview-check-contrast-v1',
    base,
    status: certain.length ? 'fail' : 'pass',
    checkedTextNodes: rows.length,
    certainFailures: certain.length,
    uncertainFailures: failures.length - certain.length,
    failures,
  }, null, 2));
  return certain.length ? 2 : 0;
}
