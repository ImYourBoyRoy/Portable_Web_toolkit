// ./Web_Toolkit/preview_check/src/lib/browser.mjs
/**
 * Shared helpers for preview-check: resolve Playwright from the project, normalize URLs and routes.
 *
 * Playwright is a normal dev dependency of a site, so it is resolved from the project root (not bundled here).
 */

import { createRequire } from 'node:module';
import path from 'node:path';

export function resolvePlaywright(projectRoot) {
  const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));
  try {
    return requireFromProject('playwright');
  } catch {
    throw new Error('preview-check needs "playwright" in the project: npm install -D playwright && npx playwright install chromium');
  }
}

export function parseRoutes(value) {
  const routes = String(value || '/').split(',').map((route) => route.trim()).filter(Boolean);
  return routes.map((route) => (route.startsWith('/') ? route : `/${route}`));
}

export function resolveBase(flags) {
  const base = String(flags.url || flags['base-url'] || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) {
    throw new Error('Pass --url <base>, for example --url http://127.0.0.1:4321 (a local preview or any deployed host).');
  }
  return base;
}

export function slugForRoute(route) {
  return route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-');
}

export async function withBrowser(projectRoot, task) {
  const { chromium } = resolvePlaywright(projectRoot);
  const browser = await chromium.launch();
  try {
    return await task(browser);
  } finally {
    await browser.close();
  }
}
