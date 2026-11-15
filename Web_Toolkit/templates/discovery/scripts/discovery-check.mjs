// ./scripts/discovery-check.mjs
/**
 * Consistency gate for the discovery layer, run against a built tree.
 * Run: node ./scripts/discovery-check.mjs [dist/client]   (after the build and the discovery post-build)
 * Checks: sitemap and /api/content.json agree and use canonical trailing-slash URLs; every built page is listed;
 * canonical, title, description and h1 per page (titles and descriptions must be unique); Markdown twins and the
 * whole-site bundle exist; _headers carries Link/Vary rules within Cloudflare's limits; llms.txt and robots.txt are
 * coherent; page-lastmod.json is current. Exit code 1 on any FAIL; WARN lines are advisory.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || 'dist/client');
const results = { pass: 0, fail: 0, warn: 0 };
const say = (level, label, detail = '') => { results[level.toLowerCase()] += 1; console.log(`[${level}] ${label}${detail ? `: ${detail}` : ''}`); };
const check = (condition, label, detail) => say(condition ? 'PASS' : 'FAIL', label, condition ? '' : detail);
const read = (file) => fs.readFileSync(path.join(dist, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(dist, file));
const htmlFor = (pagePath) => (pagePath === '/' ? 'index.html' : `${pagePath.slice(1)}index.html`);
const meta = (html, pattern) => html.match(pattern)?.[1]?.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

const sitemap = read('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const origin = locs[0] ? new URL(locs[0]).origin : '';
check(locs.length > 0 && new Set(locs).size === locs.length, 'Sitemap URLs are unique', `${locs.length} entries`);
const bad = locs.filter((loc) => !loc.startsWith(`${origin}/`) || !loc.endsWith('/'));
check(bad.length === 0, 'Sitemap URLs are canonical (same origin, trailing slash)', bad.join(', '));
check(/<lastmod>/.test(sitemap) ? [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].every((m) => /^\d{4}-\d{2}-\d{2}/.test(m[1])) : true, 'Sitemap lastmod values are ISO dates');

const raw = JSON.parse(read('api/content.json'));
const content = Array.isArray(raw) ? raw : raw.routes;
check(JSON.stringify(content.map((page) => page.url).sort()) === JSON.stringify([...locs].sort()), '/api/content.json lists the same URLs as the sitemap');
const staticPages = content.filter((page) => page.markdownUrl);
const serverRendered = content.filter((page) => !page.markdownUrl).map((page) => page.path);
if (serverRendered.length) say('WARN', 'Server-rendered pages have no static HTML or Markdown twin', serverRendered.join(', '));

const builtPages = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== '_astro') walk(full); }
    else if (entry.name === 'index.html') builtPages.push(`/${path.relative(dist, path.dirname(full)).split(path.sep).join('/')}/`.replace(/^\/\.\/$/, '/').replace('//', '/'));
  }
};
walk(dist);
const missing = builtPages.filter((page) => !locs.includes(new URL(page, origin).href) && !/^\/(404|500)\/$/.test(page));
if (missing.length) say('WARN', 'Built pages not in the sitemap (private or utility pages are fine)', missing.join(', '));
const ssrLocs = new Set(serverRendered.map((p) => new URL(p, origin).href));
const orphan = locs.filter((loc) => !ssrLocs.has(loc) && !exists(htmlFor(new URL(loc).pathname)));
check(orphan.length === 0, 'Every sitemap URL has a built page', orphan.join(', '));

const titles = new Map();
const descriptions = new Map();
for (const loc of locs) {
  const pagePath = new URL(loc).pathname;
  if (ssrLocs.has(loc) || !exists(htmlFor(pagePath))) continue;
  const html = read(htmlFor(pagePath));
  const canonical = meta(html, /<link rel="canonical" href="([^"]+)"/);
  const title = meta(html, /<title>([^<]*)<\/title>/);
  const description = meta(html, /<meta name="description" content="([^"]*)"/);
  if (canonical !== loc) say('FAIL', `Canonical matches sitemap for ${pagePath}`, `${canonical} vs ${loc}`);
  if (!title) say('FAIL', `Title present for ${pagePath}`);
  if (!description) say('FAIL', `Description present for ${pagePath}`);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) say('FAIL', `Exactly one h1 on ${pagePath}`);
  titles.set(title, [...(titles.get(title) || []), pagePath]);
  descriptions.set(description, [...(descriptions.get(description) || []), pagePath]);
}
const dup = (map) => [...map].filter(([, pages]) => pages.length > 1).map(([, pages]) => pages.join(', ')).join('; ');
check(!dup(titles), 'Titles are unique', dup(titles));
check(!dup(descriptions), 'Descriptions are unique', dup(descriptions));

const twinProblems = staticPages.flatMap((page) => {
  const file = `${page.path.slice(1)}index.md`;
  if (!exists(file)) return [`${page.path} has no index.md`];
  const body = read(file);
  return [
    ...(body.includes(`canonical: ${page.url}`) ? [] : [`${page.path} twin has the wrong canonical`]),
    ...(body.length < 200 ? [`${page.path} twin is nearly empty`] : []),
    ...(/<(?:html|body|script|div|section)\b/i.test(body.replace(/```[\s\S]*?```/g, '')) ? [`${page.path} twin contains raw HTML`] : []),
  ];
});
check(twinProblems.length === 0, `Markdown twins exist and are sound for ${staticPages.length} pages`, twinProblems.join('; '));
check(exists('site.md') && exists('api/site.json'), 'Whole-site bundle (site.md, api/site.json) exists');

const headers = exists('_headers') ? read('_headers') : '';
const ruleCount = headers.split('\n').filter((line) => line && !line.startsWith('#') && !/^\s/.test(line)).length;
check(ruleCount <= 100, '_headers stays within Cloudflare 100 rules', `${ruleCount} rules`);
const headerGaps = staticPages.filter((page) => {
  // A path can appear in several rules (for example the toolkit's cache rule for `/` plus ours): Cloudflare merges them.
  const block = headers.split(/\n(?=\S)/).filter((rule) => rule.startsWith(`${page.path}\n`)).join('\n');
  return !block || !/rel="alternate"; type="text\/markdown"/.test(block) || !/Vary: Accept/.test(block);
});
check(headerGaps.length === 0, 'Every page has Link (markdown alternate) and Vary headers', headerGaps.map((page) => page.path).join(', '));

if (exists('llms.txt')) {
  const llms = read('llms.txt');
  check(content.every((page) => llms.includes(page.markdownUrl || page.url)), 'llms.txt links every page (Markdown twin when one exists)');
}
if (exists('robots.txt')) {
  const robots = read('robots.txt');
  check(/^Sitemap: /m.test(robots), 'robots.txt declares the sitemap');
  check(!/^Disallow: \/\s*$/m.test(robots), 'robots.txt does not block the whole production site', 'a Disallow: / rule is present (expected only on preview hosts)');
}

try {
  execFileSync('node', [path.join(root, 'scripts/refresh-page-lastmod.mjs'), '--check'], { stdio: 'pipe', cwd: root });
  say('PASS', 'src/data/page-lastmod.json is current with git');
} catch { say('FAIL', 'src/data/page-lastmod.json is stale', 'run node ./scripts/refresh-page-lastmod.mjs and rebuild'); }

console.log(`\nSummary: pass=${results.pass} fail=${results.fail} warn=${results.warn}`);
process.exit(results.fail ? 1 : 0);
