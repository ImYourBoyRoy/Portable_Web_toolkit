// ./Web_Toolkit/templates/analytics/lib/config.ts
/**
 * Resolves analytics configuration from public env vars and the optional src/data/analytics.json.
 * Env wins over JSON. Invalid ids are dropped with a warning instead of reaching the page, so a typo
 * can never ship a broken or hostile script URL. Erasable-syntax TypeScript (testable under plain Node).
 *
 * Env vars: PUBLIC_ANALYTICS_ENABLED, PUBLIC_GA4_ID, PUBLIC_POSTHOG_KEY, PUBLIC_POSTHOG_HOST, PUBLIC_CF_BEACON_TOKEN.
 */

export const POSTHOG_DEFAULT_HOST = 'https://us.i.posthog.com';

export interface Ga4Config {
  id: string;
}

export interface PostHogConfig {
  key: string;
  host: string;
  autocapture: boolean;
  sessionRecording: boolean;
}

export interface CloudflareConfig {
  token: string;
  /** When false the beacon loads for everyone (Cloudflare Web Analytics is cookieless). Default true. */
  requireConsent: boolean;
  /** Track history-API navigations of single-page apps. */
  spa: boolean;
}

export interface ConsentCopy {
  privacyHref: string;
  heading: string;
  description: string;
}

export interface AnalyticsConfig {
  enabled: boolean;
  ga4: Ga4Config | null;
  posthog: PostHogConfig | null;
  cloudflare: CloudflareConfig | null;
  consent: ConsentCopy;
  /** True when at least one provider needs the consent banner. */
  needsConsent: boolean;
  warnings: string[];
}

type Dict = Record<string, unknown>;

const GA4_ID = /^G-[A-Z0-9]{4,20}$/;
const POSTHOG_KEY = /^phc_[A-Za-z0-9]{10,}$/;
const CF_TOKEN = /^[a-f0-9]{32}$/;

const asDict = (value: unknown): Dict => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : {});

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const bool = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['false', '0', 'off', 'no'].includes(v)) return false;
    if (['true', '1', 'on', 'yes'].includes(v)) return true;
  }
  return fallback;
};

/** First non-empty value: env, then JSON. */
const pick = (...values: unknown[]): string => {
  for (const value of values) {
    const text = str(value);
    if (text) return text;
  }
  return '';
};

/** Returns the origin of an https URL, or '' when the value is not a plain https host. */
export function normalizeHttpsOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

/** Only same-site paths or https URLs are accepted for the privacy policy link. */
export function normalizeHref(value: string, fallback: string): string {
  if (!value) return fallback;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value;
  return normalizeHttpsOrigin(value) ? value : fallback;
}

export function resolveAnalyticsConfig(env: unknown, json: unknown = {}): AnalyticsConfig {
  const e = asDict(env);
  const j = asDict(json);
  const warnings: string[] = [];

  const enabled = bool(e.PUBLIC_ANALYTICS_ENABLED, bool(j.enabled, true));

  let ga4: Ga4Config | null = null;
  const ga4Raw = pick(e.PUBLIC_GA4_ID, asDict(j.ga4).measurementId).toUpperCase();
  if (ga4Raw) {
    if (GA4_ID.test(ga4Raw)) ga4 = { id: ga4Raw };
    else warnings.push(`PUBLIC_GA4_ID "${ga4Raw}" is not a GA4 measurement id (G-XXXXXXXX); GA4 disabled.`);
  }

  let posthog: PostHogConfig | null = null;
  const phJson = asDict(j.posthog);
  const phKey = pick(e.PUBLIC_POSTHOG_KEY, phJson.key);
  if (phKey) {
    const hostRaw = pick(e.PUBLIC_POSTHOG_HOST, phJson.host) || POSTHOG_DEFAULT_HOST;
    const host = normalizeHttpsOrigin(hostRaw);
    if (!POSTHOG_KEY.test(phKey)) warnings.push('PUBLIC_POSTHOG_KEY is not a PostHog project key (phc_...); PostHog disabled.');
    else if (!host) warnings.push(`PUBLIC_POSTHOG_HOST "${hostRaw}" is not an https URL; PostHog disabled.`);
    else posthog = { key: phKey, host, autocapture: bool(phJson.autocapture, false), sessionRecording: bool(phJson.sessionRecording, false) };
  }

  let cloudflare: CloudflareConfig | null = null;
  const cfJson = asDict(j.cloudflareWebAnalytics);
  const cfToken = pick(e.PUBLIC_CF_BEACON_TOKEN, cfJson.token).toLowerCase();
  if (cfToken) {
    if (CF_TOKEN.test(cfToken)) {
      cloudflare = { token: cfToken, requireConsent: bool(cfJson.requireConsent, true), spa: bool(cfJson.spa, false) };
    } else {
      warnings.push('PUBLIC_CF_BEACON_TOKEN is not a 32-character Cloudflare beacon token; Web Analytics disabled.');
    }
  }

  const consentJson = asDict(j.consent);
  const consent: ConsentCopy = {
    privacyHref: normalizeHref(str(consentJson.privacyHref), '/privacy/'),
    heading: str(consentJson.heading) || 'Optional analytics',
    description:
      str(consentJson.description) ||
      'Help us understand what is useful. Analytics stay off unless you allow them, and the site works the same either way.'
  };

  if (!enabled) {
    return { enabled, ga4: null, posthog: null, cloudflare: null, consent, needsConsent: false, warnings };
  }
  const needsConsent = Boolean(ga4 || posthog || (cloudflare && cloudflare.requireConsent));
  return { enabled, ga4, posthog, cloudflare, consent, needsConsent, warnings };
}

/** JSON for a <script type="application/json"> block: escapes characters that could end the element or confuse parsers. */
export function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
