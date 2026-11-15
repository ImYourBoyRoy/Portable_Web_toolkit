// ./Web_Toolkit/brand_doctor/src/commands/og-pages.mjs
/**
 * `brand-doctor og-pages`: render one 1200x630 Open Graph card per page and write a route map.
 *
 * Purpose: give every route its own social card instead of one shared image. Cards use the site's own fonts,
 * logo, colors and (optionally) a product screenshot, so they match BRAND_GUIDE.md without a design tool.
 *
 * Inputs (project root, default cwd):
 *   og.spec.json        `pages: [{ path, file, eyebrow, title, description, screenshot? }]`, plus the usual
 *                       colors / typography / assets / output / meta blocks used by `generate-og`.
 *                       Optional `pages_module`: project-relative .mjs whose default export (sync or async)
 *                       returns more cards, for pages derived from site data (for example one per product).
 *                       Optional `pages_output`: { dir, map } (defaults public/assets/og and src/data/og-images.json).
 * Outputs (only with --apply): PNGs in the output dir and the route map JSON ("/route/": "/assets/og/x.png?v=hash")
 *   that the site layout reads to choose og:image and twitter:image per route.
 * Notes: needs `playwright` (with Chromium) and `sharp` resolvable from the project root; both are normal
 *   dev dependencies of an Astro site. Writes nothing without --apply. Never touches the site-wide card.
 */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const titleSize = (title, hasShot) => {
  const base = title.length <= 12 ? 112 : title.length <= 20 ? 92 : title.length <= 30 ? 76 : 62;
  return Math.min(base, hasShot ? 80 : 112);
};

function resolveFromProject(projectRoot, name) {
  const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));
  try {
    return requireFromProject(name);
  } catch {
    throw new Error(
      `og-pages needs "${name}" in the project (npm install -D ${name}${name === 'playwright' ? ' && npx playwright install chromium' : ''}).`
    );
  }
}

async function dataUri(projectRoot, relativePath, mime) {
  const buffer = await fs.readFile(path.join(projectRoot, relativePath));
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function cardHtml({ card, spec, fonts, logo, shot }) {
  const { width, height } = spec.output;
  const c = spec.colors;
  const accent = c.accent;
  const hasShot = Boolean(shot);
  const copyWidth = hasShot ? 470 : 760;
  const site = spec.meta?.site_name || spec.content?.title || '';
  const domain = spec.meta?.domain || String(spec.content?.eyebrow || '').toLowerCase();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
@font-face{font-family:"OG Title";src:url(${fonts.title}) format("woff2");font-weight:200 800}
@font-face{font-family:"OG Body";src:url(${fonts.body}) format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${width}px;height:${height}px;background:${c.background};overflow:hidden}
.card{position:relative;width:${width}px;height:${height}px;font-family:"OG Body",sans-serif;color:${c.text_primary};overflow:hidden;
  background:radial-gradient(760px 520px at 82% 30%, color-mix(in srgb, ${accent} 17%, transparent), transparent 70%),
             radial-gradient(520px 380px at 6% 104%, color-mix(in srgb, ${accent} 9%, transparent), transparent 70%), ${c.background}}
.rings{position:absolute;inset:0;background:repeating-radial-gradient(circle at 82% 30%, transparent 0 54px, color-mix(in srgb, ${accent} 11%, transparent) 54px 55px);
  -webkit-mask-image:radial-gradient(60% 90% at 82% 30%, #000 8%, transparent 76%);mask-image:radial-gradient(60% 90% at 82% 30%, #000 8%, transparent 76%)}
.copy{position:absolute;left:84px;top:78px;bottom:78px;width:${copyWidth}px;display:flex;flex-direction:column;justify-content:center}
.eyebrow{display:flex;align-items:center;gap:18px;font-weight:600;font-size:22px;letter-spacing:.22em;color:${accent};margin-bottom:34px}
.eyebrow:before{content:"";width:54px;height:2px;background:${accent}}
h1{font-family:"OG Title",sans-serif;font-weight:500;font-size:${titleSize(card.title, hasShot)}px;line-height:1.02;letter-spacing:-.04em;color:${c.text_primary}}
.desc{margin-top:30px;font-size:30px;line-height:1.38;font-weight:400;color:${c.text_secondary};max-width:${copyWidth}px}
.foot{position:absolute;left:84px;bottom:54px;display:flex;align-items:center;gap:18px;font-size:22px;color:${c.text_secondary};letter-spacing:.02em}
.foot img{width:46px;height:46px;object-fit:contain}
.foot b{font-weight:600;color:${c.text_primary}}
.shot{position:absolute;right:-60px;top:112px;width:640px;border-radius:22px;overflow:hidden;
  border:1px solid color-mix(in srgb, ${accent} 30%, transparent);box-shadow:0 40px 90px rgba(0,0,0,.6), 0 0 110px color-mix(in srgb, ${accent} 16%, transparent)}
.shot img{display:block;width:100%}
.mark{position:absolute;right:70px;bottom:62px;width:92px;height:92px;border-radius:50%;background:${c.background};
  display:${hasShot || !logo ? 'none' : 'grid'};place-items:center;border:2px solid color-mix(in srgb, ${accent} 50%, transparent)}
.mark img{width:60px;height:60px;object-fit:contain}
</style></head><body><div class="card"><div class="rings"></div>
  <div class="copy"><div class="eyebrow">${escapeHtml(card.eyebrow || '')}</div><h1>${escapeHtml(card.title)}</h1>${card.description ? `<p class="desc">${escapeHtml(card.description)}</p>` : ''}</div>
  ${hasShot ? `<div class="shot"><img src="${shot}" alt=""></div>` : ''}
  ${logo ? `<div class="mark"><img src="${logo}" alt=""></div>` : ''}
  <div class="foot">${logo ? `<img src="${logo}" alt="">` : ''}<span><b>${escapeHtml(site)}</b> &nbsp;${escapeHtml(domain)}</span></div>
</div></body></html>`;
}

export async function runOgPages(flags = {}) {
  const projectRoot = path.resolve(String(flags['project-root'] || process.cwd()));
  const specPath = path.resolve(projectRoot, String(flags.spec || 'og.spec.json'));
  const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
  const apply = Boolean(flags.apply);

  const cards = (spec.pages || []).map((page) => ({ ...page }));
  if (spec.pages_module) {
    const mod = await import(pathToFileURL(path.resolve(projectRoot, spec.pages_module)).href);
    const extra = typeof mod.default === 'function' ? await mod.default({ projectRoot, spec }) : mod.default;
    cards.push(...(extra || []));
  }
  if (cards.length === 0) {
    console.error('[brand-doctor og-pages] no pages found: add `pages` (or `pages_module`) to og.spec.json.');
    return 1;
  }
  const bad = cards.filter((card) => !card.path || !card.file || !card.title);
  if (bad.length) {
    console.error(`[brand-doctor og-pages] ${bad.length} page(s) are missing path, file or title.`);
    return 1;
  }

  const outDir = path.resolve(projectRoot, spec.pages_output?.dir || 'public/assets/og');
  const mapPath = path.resolve(projectRoot, spec.pages_output?.map || 'src/data/og-images.json');
  const publicRoot = path.resolve(projectRoot, 'public');
  const urlBase = `/${path.relative(publicRoot, outDir).split(path.sep).join('/')}`;

  console.log(`[brand-doctor og-pages] ${cards.length} card(s) -> ${path.relative(projectRoot, outDir)} + ${path.relative(projectRoot, mapPath)}${apply ? '' : ' (dry run, pass --apply to write)'}`);
  if (!apply) {
    for (const card of cards) console.log(`  ${card.path}  ->  ${card.file}.png  "${card.title}"`);
    return 0;
  }

  const sharp = resolveFromProject(projectRoot, 'sharp');
  const { chromium } = resolveFromProject(projectRoot, 'playwright');
  const fonts = {
    title: await dataUri(projectRoot, spec.typography.title_font.path, 'font/woff2'),
    body: await dataUri(projectRoot, spec.typography.body_font.path, 'font/woff2'),
  };
  const logo = spec.assets?.logo ? await dataUri(projectRoot, spec.assets.logo, 'image/png') : '';
  const { width, height } = spec.output;
  await fs.mkdir(outDir, { recursive: true });

  const map = {};
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    for (const card of cards) {
      let shot = '';
      if (card.screenshot) {
        const buffer = await sharp(path.join(projectRoot, card.screenshot)).resize({ width: 1000 }).jpeg({ quality: 86 }).toBuffer();
        shot = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      }
      await page.setContent(cardHtml({ card, spec, fonts, logo, shot }), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const raw = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
      const png = await sharp(raw).png({ compressionLevel: 9, palette: true, quality: 92, colors: 192, dither: 0.6 }).toBuffer();
      await fs.writeFile(path.join(outDir, `${card.file}.png`), png);
      const hash = createHash('sha1').update(png).digest('hex').slice(0, 8);
      map[card.path] = `${urlBase}/${card.file}.png?v=${hash}`;
      console.log(`  ${card.path} -> ${card.file}.png (${(png.length / 1024).toFixed(0)} KB)`);
    }
  } finally {
    await browser.close();
  }
  await fs.mkdir(path.dirname(mapPath), { recursive: true });
  await fs.writeFile(mapPath, `${JSON.stringify(map, null, 2)}\n`);
  console.log(`[brand-doctor og-pages] wrote ${cards.length} cards and ${path.relative(projectRoot, mapPath)}`);
  return 0;
}
