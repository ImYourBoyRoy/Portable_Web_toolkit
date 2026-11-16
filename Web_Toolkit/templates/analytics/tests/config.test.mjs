// ./Web_Toolkit/templates/analytics/tests/config.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHref, normalizeHttpsOrigin, resolveAnalyticsConfig, serializeForScript } from '../lib/config.ts';
import {
  CF_BEACON_SRC,
  POSTHOG_DEFAULTS_DATE,
  cfBeaconAttributes,
  cookieClearDomains,
  ga4ConsentPayload,
  ga4DisableKey,
  ga4ScriptUrl,
  isGoogleAnalyticsCookie,
  isPreviewHost,
  posthogInitOptions
} from '../lib/providers.ts';

const CF = 'a'.repeat(32);
const PH = 'phc_' + 'x'.repeat(40);

test('everything unset resolves to a clean no-op', () => {
  const c = resolveAnalyticsConfig({}, {});
  assert.equal(c.ga4, null);
  assert.equal(c.posthog, null);
  assert.equal(c.cloudflare, null);
  assert.equal(c.needsConsent, false);
  assert.deepEqual(c.warnings, []);
  assert.deepEqual(resolveAnalyticsConfig(undefined, undefined).warnings, []);
});

test('env vars configure all providers with documented defaults', () => {
  const c = resolveAnalyticsConfig({
    PUBLIC_GA4_ID: ' g-abc123xyz ',
    PUBLIC_POSTHOG_KEY: PH,
    PUBLIC_CF_BEACON_TOKEN: CF
  });
  assert.equal(c.ga4.id, 'G-ABC123XYZ');
  assert.deepEqual(c.posthog, { key: PH, host: 'https://us.i.posthog.com', autocapture: false, sessionRecording: false });
  assert.deepEqual(c.cloudflare, { token: CF, requireConsent: true, spa: false });
  assert.equal(c.needsConsent, true);
});

test('env wins over analytics.json, json fills gaps', () => {
  const c = resolveAnalyticsConfig(
    { PUBLIC_GA4_ID: 'G-ENVID1234' },
    {
      ga4: { measurementId: 'G-JSONID1234' },
      posthog: { key: PH, host: 'https://eu.i.posthog.com/', autocapture: true, sessionRecording: 'true' },
      consent: { privacyHref: '/legal#analytics', heading: 'Stats' }
    }
  );
  assert.equal(c.ga4.id, 'G-ENVID1234');
  assert.equal(c.posthog.host, 'https://eu.i.posthog.com');
  assert.equal(c.posthog.autocapture, true);
  assert.equal(c.posthog.sessionRecording, true);
  assert.equal(c.consent.privacyHref, '/legal#analytics');
  assert.equal(c.consent.heading, 'Stats');
});

test('PUBLIC_ANALYTICS_ENABLED=false disables every provider', () => {
  for (const off of ['false', 'FALSE', '0', 'off']) {
    const c = resolveAnalyticsConfig({ PUBLIC_ANALYTICS_ENABLED: off, PUBLIC_GA4_ID: 'G-ABCD1234', PUBLIC_CF_BEACON_TOKEN: CF });
    assert.equal(c.enabled, false, off);
    assert.equal(c.ga4, null);
    assert.equal(c.needsConsent, false);
  }
  assert.equal(resolveAnalyticsConfig({}, { enabled: false, ga4: { measurementId: 'G-ABCD1234' } }).ga4, null);
});

test('invalid ids are dropped with a warning instead of reaching the page', () => {
  const c = resolveAnalyticsConfig({
    PUBLIC_GA4_ID: 'UA-1234-1"><script>',
    PUBLIC_POSTHOG_KEY: 'sk_live_nope',
    PUBLIC_CF_BEACON_TOKEN: 'not-a-token'
  });
  assert.equal(c.ga4, null);
  assert.equal(c.posthog, null);
  assert.equal(c.cloudflare, null);
  assert.equal(c.warnings.length, 3);
  const http = resolveAnalyticsConfig({ PUBLIC_POSTHOG_KEY: PH, PUBLIC_POSTHOG_HOST: 'http://insecure.example' });
  assert.equal(http.posthog, null);
  assert.match(http.warnings[0], /https/);
});

test('Cloudflare Web Analytics can opt out of the consent gate and then does not force the banner', () => {
  const c = resolveAnalyticsConfig({}, { cloudflareWebAnalytics: { token: CF, requireConsent: false, spa: true } });
  assert.deepEqual(c.cloudflare, { token: CF, requireConsent: false, spa: true });
  assert.equal(c.needsConsent, false);
  const both = resolveAnalyticsConfig({ PUBLIC_GA4_ID: 'G-ABCD1234' }, { cloudflareWebAnalytics: { token: CF, requireConsent: false } });
  assert.equal(both.needsConsent, true);
});

test('href and origin normalisers reject unsafe values', () => {
  assert.equal(normalizeHttpsOrigin('https://u:p@x.example'), '');
  assert.equal(normalizeHttpsOrigin('javascript:alert(1)'), '');
  assert.equal(normalizeHttpsOrigin('https://x.example/path?q=1'), 'https://x.example');
  assert.equal(normalizeHref('//evil.example', '/p/'), '/p/');
  assert.equal(normalizeHref('javascript:alert(1)', '/p/'), '/p/');
  assert.equal(normalizeHref('/privacy/', '/p/'), '/privacy/');
  assert.equal(normalizeHref('https://example.com/privacy', '/p/'), 'https://example.com/privacy');
  assert.equal(normalizeHref('', '/p/'), '/p/');
});

test('serializeForScript cannot break out of a script element', () => {
  const out = serializeForScript({ a: '</script><script>alert(1)</script>', b: 'x\u2028y', c: 'a&b' });
  assert.ok(!out.includes('<') && !out.includes('>') && !out.includes('&'));
  assert.ok(!out.includes('\u2028'));
  assert.deepEqual(JSON.parse(out), { a: '</script><script>alert(1)</script>', b: 'x\u2028y', c: 'a&b' });
});

test('GA4 helpers: url encoding, consent mode v2 payload, opt-out flag, preview hosts', () => {
  assert.equal(ga4ScriptUrl('G-ABC&x=1'), 'https://www.googletagmanager.com/gtag/js?id=G-ABC%26x%3D1');
  assert.deepEqual(ga4ConsentPayload(true), {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  });
  assert.equal(ga4ConsentPayload(false).analytics_storage, 'denied');
  assert.equal(ga4DisableKey('G-1'), 'ga-disable-G-1');
  for (const host of ['localhost', '127.0.0.1', 'site.workers.dev', 'staging.example.com', 'dev.example.com', 'a.localhost']) {
    assert.equal(isPreviewHost(host), true, host);
  }
  assert.equal(isPreviewHost('www.example.com'), false);
});

test('GA4 cookie clean-up targets Google cookies and every parent domain', () => {
  for (const name of ['_ga', '_ga_ABC123', '_gid', '_gat_gtag_x', '_gcl_au']) assert.equal(isGoogleAnalyticsCookie(name), true, name);
  for (const name of ['session', 'pwt-analytics-consent', 'garage']) assert.equal(isGoogleAnalyticsCookie(name), false, name);
  assert.deepEqual(cookieClearDomains('www.shop.example.com'), [
    'www.shop.example.com',
    '.www.shop.example.com',
    '.shop.example.com',
    '.example.com'
  ]);
  assert.deepEqual(cookieClearDomains('localhost'), ['localhost']);
  assert.deepEqual(cookieClearDomains(''), []);
});

test('PostHog options follow the toolkit privacy-first defaults', () => {
  assert.equal(POSTHOG_DEFAULTS_DATE, '2026-08-30');
  const o = posthogInitOptions({ apiHost: 'https://eu.i.posthog.com' });
  assert.deepEqual(o, {
    api_host: 'https://eu.i.posthog.com',
    defaults: '2026-08-30',
    capture_pageview: 'history_change',
    autocapture: false,
    disable_session_recording: true,
    disable_surveys: true,
    respect_dnt: true
  });
  const opt = posthogInitOptions({ apiHost: 'https://x.example', autocapture: true, sessionRecording: true });
  assert.equal(opt.autocapture, true);
  assert.equal(opt.disable_session_recording, false);
});

test('Cloudflare beacon attributes', () => {
  const a = cfBeaconAttributes({ token: CF });
  assert.equal(a.src, CF_BEACON_SRC);
  assert.deepEqual(JSON.parse(a['data-cf-beacon']), { token: CF });
  assert.deepEqual(JSON.parse(cfBeaconAttributes({ token: CF, spa: true })['data-cf-beacon']), { token: CF, spa: true });
});
