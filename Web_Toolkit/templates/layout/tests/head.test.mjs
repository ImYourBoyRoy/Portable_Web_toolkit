// ./Web_Toolkit/templates/layout/tests/head.test.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const head = await import('../lib/head.ts');
const discovery = await import(pathToFileURL(path.join(here, '../../discovery/lib/site.ts')).href);

describe('formatTitle', () => {
  it('uses the site name on the home page', () => {
    assert.equal(head.formatTitle(undefined, 'Acme'), 'Acme');
    assert.equal(head.formatTitle('  acme ', 'Acme'), 'acme');
    assert.equal(head.formatTitle('', 'Acme'), 'Acme');
  });
  it('applies the template and collapses whitespace', () => {
    assert.equal(head.formatTitle('About   us', 'Acme'), 'About us | Acme');
    assert.equal(head.formatTitle('About', 'Acme', '%site - %s'), 'Acme - About');
  });
  it('does not brand a title twice', () => {
    assert.equal(head.formatTitle('Acme Pricing', 'Acme'), 'Acme Pricing');
  });
  it('never interprets $ patterns in titles', () => {
    assert.equal(head.formatTitle('Save $& more', 'Acme'), 'Save $& more | Acme');
  });
});

describe('canonical and absolute URLs', () => {
  it('mirrors the discovery canonicalPagePath and markdownPathFor', () => {
    for (const sample of ['/', '', '/about', '/about/', '/api/x', '/.well-known/security.txt', '/feed.xml', '/a?b=1', '/blog/post']) {
      assert.equal(head.canonicalPagePath(sample), discovery.canonicalPagePath(sample), sample);
    }
    for (const sample of ['/', '/about', '/about/', '/blog/post']) {
      assert.equal(head.markdownPathFor(sample), discovery.markdownPathFor(sample), sample);
    }
  });
  it('mirrors the discovery isIndexableHost', () => {
    for (const host of ['example.com', 'localhost', '127.0.0.1', 'x.workers.dev', 'y.pages.dev', 'staging.x.com', 'dev.x.com', 'preview.x.com', '']) {
      assert.equal(head.isIndexableHost(host), discovery.isIndexableHost(host), host);
    }
  });
  it('builds trailing-slash absolute canonicals without query or hash', () => {
    assert.equal(head.buildCanonicalUrl('https://acme.com', '/about?x=1#top'), 'https://acme.com/about/');
    assert.equal(head.buildCanonicalUrl('https://acme.com', '/'), 'https://acme.com/');
    assert.equal(head.buildCanonicalUrl('https://acme.com', '/feed.xml'), 'https://acme.com/feed.xml');
    assert.equal(head.buildCanonicalUrl('', '/about'), '/about/');
    assert.equal(head.buildCanonicalUrl('https://acme.com', '/about'), discovery.canonicalUrl('https://acme.com', '/about'));
  });
  it('resolves absolute URLs', () => {
    assert.equal(head.absoluteUrl('https://acme.com', '/og.png'), 'https://acme.com/og.png');
    assert.equal(head.absoluteUrl('https://acme.com', 'og.png'), 'https://acme.com/og.png');
    assert.equal(head.absoluteUrl('https://acme.com', 'https://cdn.example/x.png'), 'https://cdn.example/x.png');
    assert.equal(head.absoluteUrl('https://acme.com', '//cdn.example/x.png'), 'https://cdn.example/x.png');
    assert.equal(head.absoluteUrl('', '/og.png'), '/og.png');
  });
  it('normalizes origins', () => {
    assert.equal(head.normalizeOrigin('https://acme.com/'), 'https://acme.com');
    assert.equal(head.normalizeOrigin(new URL('https://acme.com/')), 'https://acme.com');
    assert.equal(head.normalizeOrigin('not a url'), '');
    assert.equal(head.normalizeOrigin(undefined), '');
  });
  it('versions assets once', () => {
    assert.equal(head.withVersion('/a.png', '42'), '/a.png?v=42');
    assert.equal(head.withVersion('/a.png?x=1', '42'), '/a.png?x=1&v=42');
    assert.equal(head.withVersion('/a.png?v=1', '42'), '/a.png?v=42');
    assert.equal(head.withVersion('/a.png', ''), '/a.png');
  });
});

describe('indexing', () => {
  it('indexes a real production host', () => {
    const result = head.resolveIndexing({ hostname: 'acme.com', isProd: true });
    assert.equal(result.indexable, true);
    assert.equal(result.robots, head.ROBOTS_INDEX);
  });
  it('noindexes previews, placeholders, env overrides and the noindex prop', () => {
    assert.equal(head.resolveIndexing({ hostname: 'x.workers.dev' }).indexable, false);
    assert.equal(head.resolveIndexing({ hostname: 'example.com' }).reason, 'placeholder host');
    assert.equal(head.resolveIndexing({ hostname: 'acme.com', siteEnv: 'staging' }).indexable, false);
    assert.equal(head.resolveIndexing({ hostname: 'acme.com', siteEnv: 'production' }).indexable, true);
    assert.equal(head.resolveIndexing({ hostname: 'acme.com', noindex: true }).robots, head.ROBOTS_NOINDEX);
  });
  it('falls back to the PROD flag without a hostname and honors an explicit robots string first', () => {
    assert.equal(head.resolveIndexing({ isProd: true }).indexable, true);
    assert.equal(head.resolveIndexing({ isProd: false }).indexable, false);
    const custom = head.resolveIndexing({ robots: 'noindex, follow', hostname: 'acme.com' });
    assert.deepEqual([custom.indexable, custom.robots], [false, 'noindex, follow']);
  });
});

describe('small normalizers', () => {
  it('twitter handles', () => {
    assert.equal(head.normalizeTwitterHandle('@yourhandle'), '');
    assert.equal(head.normalizeTwitterHandle(''), '');
    assert.equal(head.normalizeTwitterHandle('acme'), '@acme');
    assert.equal(head.normalizeTwitterHandle('@bad handle!'), '');
  });
  it('locales', () => {
    assert.equal(head.langFromLocale('en_US'), 'en-US');
    assert.equal(head.langFromLocale('???'), 'en');
    assert.equal(head.ogLocaleFrom('en-GB'), 'en_GB');
    assert.equal(head.ogLocaleFrom(''), 'en_US');
  });
  it('image mime types; svg is not offered to social crawlers', () => {
    assert.equal(head.imageMimeType('/og.png?v=2'), 'image/png');
    assert.equal(head.imageMimeType('/og.JPG'), 'image/jpeg');
    assert.equal(head.imageMimeType('/og.svg'), '');
  });
});

describe('icons', () => {
  it('defaults to svg + apple-touch + manifest, no legacy ico', () => {
    const links = head.resolveIcons();
    assert.deepEqual(links.map((l) => l.href), ['/favicon.svg', '/apple-touch-icon.png', '/manifest.webmanifest']);
    assert.equal(links[0].type, 'image/svg+xml');
  });
  it('overrides, disables and versions', () => {
    const links = head.resolveIcons({ svg: '/brand/mark.svg', apple: false, ico: '/favicon.ico' }, '7');
    assert.deepEqual(links.map((l) => l.href), ['/favicon.ico?v=7', '/brand/mark.svg?v=7', '/manifest.webmanifest?v=7']);
  });
});

describe('buildSeo', () => {
  const base = { siteName: 'Acme', origin: 'https://acme.com', pathname: '/about', ogImage: '/og.png', hostname: 'acme.com', isProd: true, markdownAlternate: true, llmsPath: '/llms.txt' };
  it('produces absolute canonical, og:image, twin and llms hints', () => {
    const seo = head.buildSeo({ ...base, title: 'About', description: '  A   page ', ogImageWidth: 1200, ogImageHeight: 630, twitterSite: '@acme' });
    assert.equal(seo.title, 'About | Acme');
    assert.equal(seo.description, 'A page');
    assert.equal(seo.canonical, 'https://acme.com/about/');
    assert.equal(seo.ogImage, 'https://acme.com/og.png');
    assert.equal(seo.ogImageType, 'image/png');
    assert.equal(seo.twitterCard, 'summary_large_image');
    assert.equal(seo.twitterSite, '@acme');
    assert.equal(seo.markdownHref, 'https://acme.com/about/index.md');
    assert.equal(seo.llmsHref, 'https://acme.com/llms.txt');
  });
  it('omits twin hints and noindexes when not indexable', () => {
    const seo = head.buildSeo({ ...base, noindex: true });
    assert.equal(seo.indexable, false);
    assert.equal(seo.markdownHref, '');
    assert.equal(seo.llmsHref, '');
  });
  it('falls back to a summary card without an image and honors a canonical override', () => {
    const seo = head.buildSeo({ ...base, ogImage: '', canonical: '/other' });
    assert.equal(seo.twitterCard, 'summary');
    assert.equal(seo.canonical, 'https://acme.com/other/');
    assert.equal(head.buildSeo({ ...base, canonical: 'https://elsewhere.com/x' }).canonical, 'https://elsewhere.com/x');
  });
  it('appends the asset version to the og image', () => {
    assert.equal(head.buildSeo({ ...base, assetVersion: '9' }).ogImage, 'https://acme.com/og.png?v=9');
  });
});
