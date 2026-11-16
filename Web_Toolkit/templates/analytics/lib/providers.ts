// ./Web_Toolkit/templates/analytics/lib/providers.ts
/**
 * Pure helpers shared by the Ga4, PostHog and CloudflareWebAnalytics components: URLs, consent payloads,
 * cookie clean-up targets and init options. Keeping them here keeps the component scripts thin and testable.
 * Erasable-syntax TypeScript.
 */

/** PostHog config defaults date: latest in @posthog/types CONFIG_DEFAULTS_DATES (toolkit CHANGELOG, 2026-08-30). */
export const POSTHOG_DEFAULTS_DATE = '2026-08-30';
export const CF_BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

export type GoogleConsentState = 'granted' | 'denied';

export interface GoogleConsentPayload {
  analytics_storage: GoogleConsentState;
  ad_storage: 'denied';
  ad_user_data: 'denied';
  ad_personalization: 'denied';
}

export function ga4ScriptUrl(id: string): string {
  return `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
}

/** Google Consent Mode v2 payload. Advertising storage is always denied: this template is analytics only. */
export function ga4ConsentPayload(granted: boolean): GoogleConsentPayload {
  return {
    analytics_storage: granted ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  };
}

/** Name of the documented opt-out flag: setting window[ga4DisableKey(id)] = true stops all GA4 measurement. */
export function ga4DisableKey(id: string): string {
  return `ga-disable-${id}`;
}

/** Hosts where GA4 DebugView should be on (local dev, workers.dev previews, dev./staging. subdomains). */
export function isPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host.endsWith('.workers.dev') ||
    host.startsWith('dev.') ||
    host.startsWith('staging.')
  );
}

export function isGoogleAnalyticsCookie(name: string): boolean {
  return /^(?:_ga|_gid|_gat|_gcl_|_dc_gtm_)/i.test(name.trim());
}

/** Cookie domains to try when clearing: the host and every parent with at least two labels. */
export function cookieClearDomains(hostname: string): string[] {
  const labels = hostname.toLowerCase().split('.').filter(Boolean);
  if (labels.length === 0) return [];
  const domains = [hostname.toLowerCase()];
  for (let i = 0; i <= labels.length - 2; i += 1) domains.push(`.${labels.slice(i).join('.')}`);
  return domains;
}

export interface PostHogOptionsInput {
  apiHost: string;
  autocapture?: boolean;
  sessionRecording?: boolean;
}

/**
 * posthog.init options. Privacy-first: page views via history changes, no autocapture, no session recording,
 * no surveys, Do Not Track respected. Recording and autocapture are opt-in through analytics.json.
 */
export function posthogInitOptions(input: PostHogOptionsInput): Record<string, unknown> {
  return {
    api_host: input.apiHost,
    defaults: POSTHOG_DEFAULTS_DATE,
    capture_pageview: 'history_change',
    autocapture: input.autocapture === true,
    disable_session_recording: input.sessionRecording !== true,
    disable_surveys: true,
    respect_dnt: true
  };
}

export interface BeaconInput {
  token: string;
  spa?: boolean;
}

/** Attributes of the Cloudflare Web Analytics beacon script element. */
export function cfBeaconAttributes(input: BeaconInput): Record<string, string> {
  const payload: Record<string, unknown> = { token: input.token };
  if (input.spa) payload.spa = true;
  return { src: CF_BEACON_SRC, 'data-cf-beacon': JSON.stringify(payload) };
}
