// ./Web_Toolkit/discovery_doctor/tests/validate.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyzeJsonLd,
  looksLikeJson,
  looksLikeSitemapXml,
  robotsHasExactDisallowAll,
  robotsReferencesSitemap
} from '../src/validate.mjs';
import { createReport, exitCodeForReport, addResult } from '../src/report.mjs';

describe('looksLikeSitemapXml', () => {
  it('accepts urlset and sitemapindex', () => {
    assert.equal(looksLikeSitemapXml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'), true);
    assert.equal(looksLikeSitemapXml('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>'), true);
    assert.equal(looksLikeSitemapXml('<html></html>'), false);
  });
});

describe('robots helpers', () => {
  it('detects Sitemap directive', () => {
    assert.equal(robotsReferencesSitemap('User-agent: *\nSitemap: https://example.com/sitemap.xml\n'), true);
    assert.equal(robotsReferencesSitemap('User-agent: *\nDisallow: /\n'), false);
  });

  it('exact Disallow: / only', () => {
    assert.equal(robotsHasExactDisallowAll('Disallow: /\n'), true);
    assert.equal(robotsHasExactDisallowAll('Disallow: /admin\n'), false);
  });
});

describe('JSON + JSON-LD', () => {
  it('parses JSON', () => {
    assert.equal(looksLikeJson('{"ok":true}'), true);
    assert.equal(looksLikeJson('not-json'), false);
  });

  it('requires web identity types; breadcrumb optional', () => {
    const html = `<script type="application/ld+json">{"@type":"WebSite","name":"Demo"}</script>`;
    const result = analyzeJsonLd(html);
    assert.equal(result.hasJsonLd, true);
    assert.equal(result.hasWebIdentity, true);
    assert.equal(result.hasBreadcrumb, false);
  });
});

describe('exit codes', () => {
  it('fails closed on fail; warn does not fail unless strict', () => {
    const report = createReport();
    addResult(report, 'warn', 'Breadcrumb Schema', 'missing');
    assert.equal(exitCodeForReport(report), 0);
    assert.equal(exitCodeForReport(report, { strict: true }), 2);
    addResult(report, 'fail', 'Vision-Ready Sitemap', 'missing');
    assert.equal(exitCodeForReport(report), 2);
  });
});
