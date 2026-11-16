// ./Web_Toolkit/templates/layout/tests/nav.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const nav = await import('../lib/nav.ts');

describe('matchCurrent', () => {
  it('marks the exact page, tolerant of slashes, query and index.html', () => {
    assert.equal(nav.matchCurrent('/about/', '/about'), 'page');
    assert.equal(nav.matchCurrent('/about', '/about/'), 'page');
    assert.equal(nav.matchCurrent('/about/?x=1', '/about/index.html'), 'page');
    assert.equal(nav.matchCurrent('/', '/'), 'page');
  });
  it('marks ancestors as a section, never the home link', () => {
    assert.equal(nav.matchCurrent('/blog/', '/blog/post/'), 'section');
    assert.equal(nav.matchCurrent('/', '/blog/'), null);
    assert.equal(nav.matchCurrent('/blog/', '/blogging/'), null);
  });
  it('ignores anchors, external links and mailto', () => {
    assert.equal(nav.matchCurrent('/#faq', '/'), null);
    assert.equal(nav.matchCurrent('#faq', '/'), null);
    assert.equal(nav.matchCurrent('https://acme.com/', '/'), null);
    assert.equal(nav.matchCurrent('mailto:a@b.c', '/'), null);
    assert.equal(nav.matchCurrent(undefined, '/'), null);
  });
});

describe('parseNavConfig / resolveNav', () => {
  const raw = {
    brand: { logo: '/m.svg', showName: false, logoWidth: 32 },
    items: [
      { label: 'Home', href: '/' },
      { label: 'Services', href: '/services/', children: [{ label: 'Design', href: '/services/design/' }, { label: '', href: '/x' }, { nope: 1 }] },
      { label: 'Menu only', children: [{ label: 'Docs', href: '/docs/' }] },
      { label: 'Empty parent' },
      { label: 'Ext', href: 'https://acme.dev/' },
      'junk',
    ],
    cta: { label: 'Contact', href: '/contact/' },
  };
  it('drops invalid entries instead of throwing and applies defaults', () => {
    const config = nav.parseNavConfig(raw);
    assert.deepEqual(config.items.map((i) => i.label), ['Home', 'Services', 'Menu only', 'Ext']);
    assert.equal(config.items[1].children.length, 1);
    assert.equal(config.items[3].external, true);
    assert.equal(config.brand.showName, false);
    assert.equal(config.brand.logoWidth, 32);
    assert.equal(config.brand.logoHeight, 40);
    assert.equal(config.brand.href, '/');
    assert.equal(config.cta.label, 'Contact');
    assert.deepEqual(nav.parseNavConfig(null).items, []);
  });
  it('marks aria-current for the page and section for parents of the current child', () => {
    const items = nav.resolveNav(nav.parseNavConfig(raw).items, '/services/design/');
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i]));
    assert.equal(byLabel.Home.current, null);
    assert.equal(byLabel.Services.current, 'section');
    assert.equal(byLabel.Services.children[0].current, 'page');
    assert.equal(nav.resolveNav(nav.parseNavConfig(raw).items, '/services/')[1].current, 'page');
    const menuOnly = nav.resolveNav(nav.parseNavConfig(raw).items, '/docs/')[2];
    assert.equal(menuOnly.current, 'section');
  });
});

describe('footer and years', () => {
  it('parses columns, legal and defaults', () => {
    const footer = nav.parseFooterConfig({
      tagline: ' Hi ',
      columns: [{ title: 'Explore', links: [{ label: 'A', href: '/a/' }, { label: '' }] }, { title: 'Empty', links: [] }],
      legal: [{ label: 'Privacy', href: '/privacy/' }],
      copyright: { startYear: 2021 },
    });
    assert.equal(footer.tagline, 'Hi');
    assert.equal(footer.columns.length, 1);
    assert.equal(footer.legal[0].href, '/privacy/');
    assert.equal(footer.copyright.text, 'All rights reserved.');
    assert.equal(footer.copyright.startYear, 2021);
  });
  it('computes copyright ranges at build time', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    assert.equal(nav.copyrightYears(2021, now), '2021–2026');
    assert.equal(nav.copyrightYears(2026, now), '2026');
    assert.equal(nav.copyrightYears(undefined, now), '2026');
  });
});

describe('breadcrumbs', () => {
  it('derives a trail from the path with label overrides', () => {
    const trail = nav.breadcrumbsFromPath('/services/web-design/', { labels: { '/services/': 'What we do' } });
    assert.deepEqual(trail, [
      { label: 'Home', href: '/' },
      { label: 'What we do', href: '/services/' },
      { label: 'Web design', href: '/services/web-design/' },
    ]);
    assert.equal(nav.breadcrumbsFromPath('/').length, 1);
  });
  it('emits a BreadcrumbList with Schema.astro-compatible @id and absolute slash URLs', () => {
    const node = nav.breadcrumbListNode(nav.breadcrumbsFromPath('/services/design'), 'https://acme.com', 'https://acme.com/services/design/');
    assert.equal(node['@id'], 'https://acme.com/services/design/#breadcrumb');
    assert.deepEqual(node.itemListElement.map((i) => i.item), ['https://acme.com/', 'https://acme.com/services/', 'https://acme.com/services/design/']);
    assert.deepEqual(node.itemListElement.map((i) => i.position), [1, 2, 3]);
  });
  it('only opens web links in a new tab', () => {
    assert.equal(nav.opensNewTab('https://a.b'), true);
    assert.equal(nav.opensNewTab('//a.b'), true);
    assert.equal(nav.opensNewTab('mailto:a@b.c'), false);
    assert.equal(nav.opensNewTab('/x/'), false);
  });
});
