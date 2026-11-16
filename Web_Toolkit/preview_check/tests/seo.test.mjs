import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeLinks, analyzePages, renderIssues } from '../src/lib/seo-rules.mjs';
import { extractLocs, routesFromSitemap } from '../../shared/lib/sitemap.mjs';

const good = (route, overrides = {}) => ({
  route, title: `Page ${route} | Brand Name`, description: `A description of ${route} that is comfortably long enough to be a useful snippet in results.`,
  canonical: `https://example.com${route}`, robots: 'index,follow', lang: 'en', h1: 1,
  og: { 'og:title': 't', 'og:description': 'd', 'og:image': 'https://example.com/og.png', 'og:url': `https://example.com${route}` },
  twitterCard: 'summary_large_image', jsonLd: [{ ok: true, type: 'WebPage' }], hreflang: [], images: { total: 2, unsized: 0 }, ...overrides
});

test('a clean page set reports nothing', () => {
  assert.deepEqual(analyzePages([good('/'), good('/about/')], { canonicalHost: 'example.com' }), []);
});

test('issues are grouped by cause across pages, errors first', () => {
  const issues = analyzePages([
    good('/', { title: 'Same title across pages here' }),
    good('/a/', { title: 'Same title across pages here', description: '' }),
    good('/b/', { h1: 3, canonical: '/b/', robots: 'noindex', images: { total: 4, unsized: 3 } }),
    good('/c/', { og: { 'og:title': 't' } })
  ]);
  const byId = Object.fromEntries(issues.map((issue) => [issue.id, issue]));
  assert.equal(byId['title-duplicate'].pages[0].route, '/ /a/');
  assert.equal(byId['description-missing'].pages.length, 1);
  assert.equal(byId['canonical-relative'].severity, 'error');
  assert.equal(byId.noindex.severity, 'error');
  assert.equal(byId['h1-multiple'].pages[0].detail, '3');
  assert.equal(byId['img-unsized'].pages[0].detail, '3/4');
  assert.equal(byId['og-image-missing'].pages.length, 1);
  assert.equal(issues[0].severity, 'error');
  assert.equal(issues.at(-1).severity, 'warn');
});

test('canonical checks: host, trailing slash, and different path', () => {
  const ids = (page, options) => analyzePages([page], options).map((issue) => issue.id);
  assert.ok(ids(good('/x/', { canonical: 'https://staging.example.com/x/' }), { canonicalHost: 'example.com' }).includes('canonical-host'));
  assert.ok(ids(good('/x/', { canonical: 'https://example.com/x' })).includes('canonical-slash'));
  assert.ok(ids(good('/x/', { canonical: 'https://example.com/y/' })).includes('canonical-other-page'));
  assert.ok(!ids(good('/x/', { robots: 'noindex' }), { expectIndexable: false }).includes('noindex'));
});

test('links: broken and redirecting targets are reported with the pages that link them', () => {
  const issues = analyzeLinks([
    { target: '/ok/', status: 200, from: ['/'] },
    { target: '/gone/', status: 404, from: ['/', '/a/'] },
    { target: '/old', status: 301, location: '/old/', from: ['/'] },
    { target: '/down/', status: 0, from: ['/b/'] },
    { target: '/gone/?topic=ai', status: 404, from: ['/c/'] }
  ]);
  assert.equal(issues.length, 3, 'query variants of a broken path are one cause');
  assert.equal(issues.find((issue) => issue.id === 'link-broken' && issue.message.includes('/gone/')).pages.length, 3);
  assert.equal(issues[0].severity, 'error');
  assert.equal(issues.find((issue) => issue.id === 'link-redirect').severity, 'warn');
  const text = renderIssues([...analyzePages([good('/', { h1: 0 })]), ...issues], { total: 5, maxPages: 1 });
  assert.match(text, /^seo: 5 pages \| 3 error cause/);
  assert.match(text, /ERR  link-broken: broken internal link \/gone\/ \(404\) \| 3 pages: \/ \+2/);
  assert.equal(renderIssues([], { total: 2 }), 'seo: 2 pages | 0 error causes, 0 warning causes\nno issues\n');
});

test('sitemap routes keep the production host pages, follow one index level, and map onto the preview origin', async () => {
  assert.deepEqual(extractLocs('<loc> https://a.test/x </loc><loc><![CDATA[https://a.test/y?q=1&amp;z=2]]></loc>'), ['https://a.test/x', 'https://a.test/y?q=1&z=2']);
  const origin = 'http://127.0.0.1:4321';
  const files = {
    [`${origin}/sitemap.xml`]: '<sitemapindex><sitemap><loc>https://example.com/sitemap-0.xml</loc></sitemap></sitemapindex>',
    [`${origin}/sitemap-0.xml`]: '<urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/a/</loc></url><url><loc>https://cdn.other.com/x</loc></url></urlset>'
  };
  const fetchImpl = async (url) => (url in files ? { ok: true, text: async () => files[url] } : { ok: false, status: 404 });
  const result = await routesFromSitemap({ baseUrl: origin, fetchImpl });
  assert.deepEqual(result.routes, ['/', '/a/']);
  await assert.rejects(routesFromSitemap({ baseUrl: origin, fetchImpl: async () => ({ ok: false, status: 404 }) }), /Could not read a sitemap/);
});
