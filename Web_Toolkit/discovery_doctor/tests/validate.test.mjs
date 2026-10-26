// ./Web_Toolkit/discovery_doctor/tests/validate.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyzeRobots,
  analyzeJsonLd,
  analyzeSitemapXml,
  contentTypeMatches,
  looksLikeJson,
  looksLikeSitemapXml,
  validateLlmsText,
  validateSecurityTxt,
  robotsHasExactDisallowAll,
  robotsReferencesSitemap
} from '../src/validate.mjs';
import { createReport, exitCodeForReport, addResult } from '../src/report.mjs';

describe('looksLikeSitemapXml', () => {
  it('accepts urlset and sitemapindex', () => {
    assert.equal(looksLikeSitemapXml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'), true);
    assert.equal(looksLikeSitemapXml('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>'), true);
    assert.equal(looksLikeSitemapXml('<html></html>'), false);
    assert.equal(looksLikeSitemapXml('<!-- <urlset> --> <html>error</html>'), false);
  });

  it('validates sitemap entries, namespaces, and URLs', () => {
    const valid = analyzeSitemapXml(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/a?x=1&amp;y=2</loc></url></urlset>'
    );
    assert.equal(valid.ok, true);
    assert.deepEqual(valid.urls, ['https://example.com/a?x=1&y=2']);

    assert.equal(analyzeSitemapXml('<urlset xmlns="wrong"><url><loc>https://example.com/</loc></url></urlset>').ok, false);
    assert.equal(analyzeSitemapXml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>/relative</loc></url></urlset>').ok, false);
  });
});

describe('llms.txt', () => {
  it('accepts the v2 H1, summary, and Markdown link-list shape', () => {
    const result = validateLlmsText([
      '# Example',
      '> A concise public summary.',
      '',
      '## Public pages',
      '- [Home](https://example.com/): The public home page.',
      '- [Catalog](/api/catalog.json): Public structure only.',
    ].join('\n'), { baseUrl: 'https://example.com/' });
    assert.equal(result.ok, true);
    assert.equal(result.hasSummary, true);
    assert.equal(result.links.length, 2);
  });

  it('keeps minimal H1-only files valid but warns about the recommended summary', () => {
    const result = validateLlmsText('# Example');
    assert.equal(result.ok, true);
    assert.match(result.warnings.join(' '), /blockquote/i);
  });

  it('allows expanded prose and metadata in llms-full.txt sections', () => {
    const result = validateLlmsText([
      '# Example — Full Context',
      '> Expanded public context.',
      '',
      '## Pages',
      '### Home',
      '- Path: /',
      '- Description: Public home page.',
      '',
      '## API notes',
      'Use the public catalog for structure only.',
    ].join('\n'), { kind: 'full' });
    assert.equal(result.ok, true);
  });

  it('rejects malformed sections, private-looking links, and credentials', () => {
    const result = validateLlmsText([
      '# Example',
      '',
      '## Public pages',
      'This paragraph is not a Markdown link list.',
      '- [Account](https://example.com/account)',
      '- [Token](https://example.com/api?access_token=secret-value)',
      '',
      'Bearer abcdefghijklmnopqrstuvwxyz',
    ].join('\n'));
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /private-looking|sensitive query|link list|credential/i);
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
    const result = analyzeRobots('User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n');
    assert.equal(result.ok, true);
    assert.equal(result.blocksAll, false);
    assert.deepEqual(result.sitemaps, ['https://example.com/sitemap.xml']);
    assert.equal(analyzeRobots('User-agent: Googlebot\nDisallow: /\n').blocksAll, false);
    assert.equal(analyzeRobots('User-agent: *\nDisallow: /\n').blocksAll, true);
  });
});

describe('security.txt', () => {
  it('requires Contact and one future RFC 3339 Expires value', () => {
    const valid = validateSecurityTxt('Contact: mailto:security@example.com\nExpires: 2099-01-01T00:00:00Z\nPolicy: https://example.com/security\n');
    assert.equal(valid.ok, true);
    assert.equal(validateSecurityTxt('Contact: mailto:security@example.com\n').ok, false);
    assert.equal(validateSecurityTxt('Contact: mailto:security@example.com\nExpires: yesterday\n').ok, false);
    assert.equal(validateSecurityTxt('Contact: mailto:security@example.com\nExpires: 2099-01-01T00:00:00Z\nPolicy: report issues here\n').ok, false);
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

  it('does not infer valid JSON-LD from malformed script text', () => {
    const result = analyzeJsonLd('<script type="application/ld+json">{"@type":"WebSite"</script>');
    assert.equal(result.hasJsonLd, true);
    assert.equal(result.validJsonLd, 0);
    assert.equal(result.malformedJsonLd, 1);
    assert.equal(result.hasWebIdentity, false);
  });
});

describe('content types', () => {
  it('handles exact, family, and suffix wildcards', () => {
    assert.equal(contentTypeMatches({ 'content-type': 'application/json; charset=utf-8' }, ['application/json']).ok, true);
    assert.equal(contentTypeMatches({ 'content-type': 'text/plain' }, ['text/*']).ok, true);
    assert.equal(contentTypeMatches({ 'content-type': 'application/problem+json' }, ['application/*+json']).ok, true);
    assert.equal(contentTypeMatches({ 'content-type': 'text/html' }, ['application/json']).ok, false);
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
