// ./Web_Toolkit/preview_check/src/commands/motion.mjs
/**
 * `preview-check motion`: verify the motion policy holds in a real browser.
 *
 * Purpose: enforce the rules that keep cinematic pages fast and accessible:
 *  1. Reduced motion: no scroll-driven or infinite animations are running, and no decorative canvas is mounted.
 *     (Decorative = aria-hidden or pointer-events none. Functional canvases, such as a tool's preview, are not counted.)
 *  2. Above the fold: no visible text is gated by opacity (a hidden LCP candidate hurts PageSpeed).
 *  3. Mobile: no decorative canvas or WebGL surface on a phone viewport.
 *  4. Without JavaScript: the page still has real content (main text and an h1).
 * Exit codes: 0 all rules hold; 2 a rule failed; 1 failure.
 */

import path from 'node:path';
import { parseRoutes, resolveBase, withBrowser } from '../lib/browser.mjs';

const settle = (flags) => Number(flags['settle-ms'] || 1500);

export async function runMotionCheck(flags = {}) {
  const projectRoot = path.resolve(String(flags['project-root'] || process.cwd()));
  const base = resolveBase(flags);
  const routes = parseRoutes(flags.routes);

  const results = await withBrowser(projectRoot, async (browser) => {
    const out = [];
    for (const route of routes) {
      const url = `${base}${route}`;
      const issues = [];

      // 1. Reduced motion.
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(settle(flags));
        const reduced = await page.evaluate(() => {
          const live = document.getAnimations().filter((animation) => {
            const kind = animation.timeline?.constructor?.name || '';
            const timing = animation.effect?.getComputedTiming?.() || {};
            const scrollLinked = kind === 'ScrollTimeline' || kind === 'ViewTimeline';
            const infinite = timing.iterations === Infinity;
            return (scrollLinked || infinite) && animation.playState !== 'finished';
          });
          return {
            active: live.slice(0, 8).map((animation) => `${animation.animationName || animation.constructor.name} on ${animation.effect?.target?.tagName?.toLowerCase() || '?'}.${String(animation.effect?.target?.className || '').split(' ')[0]}`),
            canvases: [...document.querySelectorAll('canvas')].filter((c) => c.getAttribute('aria-hidden') === 'true' || getComputedStyle(c).pointerEvents === 'none').length,
          };
        });
        if (reduced.active.length) issues.push({ rule: 'reduced-motion-animations', detail: reduced.active });
        if (reduced.canvases) issues.push({ rule: 'reduced-motion-canvas', detail: `${reduced.canvases} canvas element(s) mounted` });
        await context.close();
      }

      // 2. Above the fold must not be gated by opacity.
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(150);
        const gated = await page.evaluate(() => {
          const found = [];
          // Only opacity that something animates counts as a gate. Static opacity 0 is hover-only UI, not a hidden LCP candidate.
          const animated = new Set();
          for (const animation of document.getAnimations()) {
            const target = animation.effect?.target;
            if (target && animation.effect.getKeyframes().some((frame) => 'opacity' in frame)) animated.add(target);
          }
          const gatedByAnimation = (el) => {
            for (let cursor = el; cursor; cursor = cursor.parentElement) if (animated.has(cursor)) return true;
            return false;
          };
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!node.textContent.trim()) continue;
            const el = node.parentElement;
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.top > innerHeight || rect.bottom < 0) continue;
            let opacity = 1;
            for (let cursor = el; cursor; cursor = cursor.parentElement) opacity *= Number(getComputedStyle(cursor).opacity);
            if (opacity < 0.99 && gatedByAnimation(el)) found.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} opacity=${opacity.toFixed(2)}`);
            if (found.length >= 8) break;
          }
          return found;
        });
        if (gated.length) issues.push({ rule: 'above-fold-opacity-gate', detail: gated });
        await context.close();
      }

      // 3. Mobile: no canvas.
      {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(settle(flags));
        const canvases = await page.evaluate(() => [...document.querySelectorAll('canvas')].filter((c) => c.getAttribute('aria-hidden') === 'true' || getComputedStyle(c).pointerEvents === 'none').length);
        if (canvases) issues.push({ rule: 'mobile-canvas', detail: `${canvases} canvas element(s) on a phone viewport` });
        await context.close();
      }

      // 4. Content without JavaScript.
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'load' });
        const content = await page.evaluate(() => ({
          mainText: (document.querySelector('main')?.innerText || '').trim().length,
          h1: document.querySelectorAll('h1').length,
        }));
        if (content.mainText < 200 || content.h1 !== 1) issues.push({ rule: 'no-js-content', detail: content });
        await context.close();
      }

      out.push({ route, ok: issues.length === 0, issues });
    }
    return out;
  });

  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ schemaVersion: 'preview-check-motion-v1', base, status: failed.length ? 'fail' : 'pass', results }, null, 2));
  return failed.length ? 2 : 0;
}
