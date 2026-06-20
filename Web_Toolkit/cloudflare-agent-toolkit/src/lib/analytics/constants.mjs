// ./Web_Toolkit/cloudflare-agent-toolkit/src/lib/analytics/constants.mjs
/**
 * Shared constants for the Astro analytics scaffold flow.
 */

export const ANALYTICS_ENV_KEYS = [
  'PUBLIC_ANALYTICS_ENABLED',
  'PUBLIC_GA4_MEASUREMENT_ID',
  'PUBLIC_POSTHOG_API_KEY',
  'PUBLIC_POSTHOG_API_HOST'
];

export const REQUIRED_CSP_TOKENS = {
  'script-src': ['https://www.googletagmanager.com', 'https://us-assets.i.posthog.com'],
  'connect-src': ['https://www.google-analytics.com', 'https://region1.google-analytics.com', 'https://us.i.posthog.com'],
  'img-src': ['https://www.google-analytics.com']
};

