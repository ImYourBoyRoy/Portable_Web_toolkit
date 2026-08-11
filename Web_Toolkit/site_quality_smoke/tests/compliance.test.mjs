// ./Web_Toolkit/site_quality_smoke/tests/compliance.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeCompliance,
  complianceIssues
} from '../src/lib/compliance.mjs';
import { summarizeReport } from '../src/lib/summary.mjs';

const PASSING_HTML = `
<html><head>
  <title>Site</title>
  <meta name="description" content="Desc">
  <link rel="canonical" href="https://example.com/">
</head><body>
  <img src="/hero.webp" width="800" height="450" alt="Hero">
  <picture>
    <source type="image/webp" srcset="/card.webp">
    <img src="/card.jpg" width="400" height="300" alt="Card">
  </picture>
  <footer><a href="/privacy">Privacy Policy</a></footer>
  <div class="cookie-banner" data-consent="true">We use cookies</div>
  <script>window.posthog = {};</script>
</body></html>`;

const FAILING_HTML = `
<html><head>
  <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet">
  <script src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF12"></script>
</head><body>
  <img src="/photo.jpg" alt="Photo">
  <img src="/icon.png" width="32" height="32" alt="">
  <a href="/about">About</a>
</body></html>`;

test('compliance passes when legal, cookies, modern images, and local fonts look healthy', () => {
  const compliance = analyzeCompliance(PASSING_HTML, { origin: 'https://example.com' });
  assert.equal(compliance.legal.linked, true);
  assert.ok(compliance.legal.hrefs.some((href) => href.includes('/privacy')));
  assert.equal(compliance.analytics.detected, true);
  assert.equal(compliance.cookieNotice.detected, true);
  assert.equal(compliance.images.legacyRaster.length, 0);
  assert.equal(compliance.fonts.remoteHosts.length, 0);
  assert.deepEqual(
    complianceIssues({ ...compliance, legalPage: { checked: true, ok: true, href: 'https://example.com/privacy' } }),
    []
  );
});

test('compliance flags missing legal link, cookies, legacy images, and remote fonts', () => {
  const compliance = analyzeCompliance(FAILING_HTML, { origin: 'https://example.com' });
  assert.equal(compliance.legal.linked, false);
  assert.ok(compliance.analytics.signals.includes('google-tag-manager') || compliance.analytics.signals.includes('ga4'));
  assert.equal(compliance.cookieNotice.detected, false);
  assert.ok(compliance.images.legacyRaster.length >= 1);
  assert.ok(compliance.images.missingDimensions.length >= 1);
  assert.ok(compliance.fonts.remoteHosts.includes('fonts.googleapis.com'));

  const issues = complianceIssues({
    ...compliance,
    legalPage: { checked: true, ok: false, status: 404, path: '/privacy' }
  });
  assert.ok(issues.some((issue) => /legal\/privacy/i.test(issue)));
  assert.ok(issues.some((issue) => /cookies\/consent/i.test(issue)));
  assert.ok(issues.some((issue) => /JPG\/PNG\/GIF/i.test(issue)));
  assert.ok(issues.some((issue) => /missing width\/height/i.test(issue)));
  assert.ok(issues.some((issue) => /remote font CDN/i.test(issue)));
});

test('false positives: marketing legal text, hash links, Cookie Policy footer alone', () => {
  const html = `
<html><body>
  <a href="#">Privacy</a>
  <a href="/about">Contact our legal team</a>
  <footer><a href="/cookie-policy">Cookie Policy</a></footer>
  <script src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF12"></script>
</body></html>`;
  const compliance = analyzeCompliance(html, { origin: 'https://example.com' });
  // cookie-policy href is a real legal path — that counts as linked
  assert.equal(compliance.legal.linked, true);
  assert.ok(compliance.legal.hrefs.some((h) => /cookie-policy/i.test(h)));
  // Cookie Policy footer link alone is NOT a consent banner
  assert.equal(compliance.cookieNotice.detected, false);
  assert.ok(compliance.analytics.detected);
});

test('hash-only and legal-team links do not satisfy legal requirement alone', () => {
  const html = `
<html><body>
  <a href="#">Privacy Policy</a>
  <a href="/careers">Join our legal team</a>
  <script>window.posthog={}</script>
  <div class="cookie-banner" data-consent="true">We use cookies</div>
</body></html>`;
  const compliance = analyzeCompliance(html, { origin: 'https://example.com' });
  assert.equal(compliance.legal.linked, false);
  assert.equal(compliance.cookieNotice.detected, true);
});

test('robotsBlocksAll requires exact Disallow: /', async () => {
  const { robotsBlocksAll } = await import('../src/lib/compliance.mjs');
  assert.equal(robotsBlocksAll('User-agent: *\nDisallow: /\n'), true);
  assert.equal(robotsBlocksAll('User-agent: *\nDisallow: /admin\n'), false);
  assert.equal(robotsBlocksAll('User-agent: *\nDisallow: /api/\n'), false);
});

test('summarizeReport includes compliance issues for production', () => {
  const compliance = analyzeCompliance(FAILING_HTML, { origin: 'https://example.com' });
  const summary = summarizeReport({
    thresholds: { maxRootDurationMs: 3000, maxRouteDurationMs: 3000 },
    production: {
      host: 'example.com',
      root: {
        ok: true,
        status: 200,
        durationMs: 100,
        csp: "default-src 'self'",
        hsts: 'max-age=31536000'
      },
      title: 'Example',
      metaDescription: 'Desc',
      canonical: 'https://example.com/',
      robots: { ok: true },
      sitemap: [{ ok: true }],
      routes: [],
      assets: [],
      httpRedirect: { status: 301, location: 'https://example.com/' },
      openGraph: { tags: { title: 'Example', description: 'Desc', url: 'https://example.com/', image: 'https://example.com/og.png' }, imageUrl: 'https://example.com/og.png', imageAbsolute: true, imageHostMatches: true, defaultImage: { ok: true }, facebookImage: { ok: true }, warnings: [] },
      compliance: {
        ...compliance,
        legalPage: { checked: true, ok: false, status: 404, path: '/privacy' }
      }
    }
  });
  assert.equal(summary.overall, 'warn');
  assert.ok(summary.issues.some((issue) => /remote font CDN/i.test(issue)));
  assert.ok(summary.issues.some((issue) => /cookies\/consent/i.test(issue)));
});
